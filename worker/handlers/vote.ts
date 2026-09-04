/**
 * Vote handlers: POST /api/vote, GET /api/votes/mine
 *
 * POST /api/vote:
 *   1. CSRF validation
 *   2. Session auth
 *   3. Rate limit
 *   4. Body validation
 *   5. Duplicate vote guard
 *   6. PR must exist and be open
 *   7. Build OASIS comment body
 *   8. POST to GitHub Issues API (user's token)
 *   9. Upsert D1: pr_participants, pull_requests consensus, contributors, user_votes
 *
 * GET /api/votes/mine:
 *   Returns all votes the logged-in user has cast.
 */

import type { Env } from '../types.js';
import {
  validateCSRF,
  checkRateLimit,
  jsonOk,
  jsonErr,
} from '../security.js';
import { getSession } from './auth.js';
import { ORG } from '../github.js';
import { recordSubmittedVote } from '../analytics.js';

/* ─── POST /api/vote ─────────────────────────────────────────── */
export async function handleVote(request: Request, env: Env): Promise<Response> {
  // 1. CSRF
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  // 2. Session auth
  const session = await getSession(request, env);
  if (!session) return jsonErr('Not authenticated — please sign in with GitHub', 401, request);

  // 3. Rate limit (per IP)
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  // 4. Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return jsonErr('Invalid JSON body', 400, request);
  }

  const prId    = typeof body['pr_id'] === 'number' ? body['pr_id'] : null;
  const decision = typeof body['decision'] === 'string' ? body['decision'].toLowerCase() : null;

  if (!prId || !Number.isInteger(prId) || prId < 1) return jsonErr('pr_id must be a positive integer', 400, request);
  if (!decision || !['accept', 'modify', 'reject', 'duplicate'].includes(decision)) {
    return jsonErr('decision must be accept, modify, reject, or duplicate', 400, request);
  }

  const confidence     = typeof body['confidence'] === 'string' ? body['confidence'].trim() : '';
  const summary        = typeof body['summary'] === 'string' ? body['summary'].trim() : '';
  const nextStep       = typeof body['next_step'] === 'string' ? body['next_step'].trim() : '';
  const blockingIssues = typeof body['blocking_issues'] === 'string' ? body['blocking_issues'].trim() : '';
  const toReconsider   = typeof body['to_reconsider'] === 'string' ? body['to_reconsider'].trim() : '';
  const notes          = typeof body['notes'] === 'string' ? body['notes'].trim() : '';
  let parentPrNumber: number | null = null;
  let parentPrId: number | null = null;
  let resolvedParentId: number | null = null;

  if (decision === 'duplicate') {
    // Validate parent_pr_number for duplicate votes (will be resolved to ID after we fetch current PR)
    parentPrNumber = typeof body['parent_pr_number'] === 'number' ? body['parent_pr_number'] : null;
    if (!parentPrNumber || !Number.isInteger(parentPrNumber) || parentPrNumber < 1) {
      return jsonErr('parent_pr_number must be a positive integer for duplicate votes', 400, request);
    }
    if (notes.length > 2000) return jsonErr('notes too long (max 2000 chars)', 400, request);
  } else if (decision === 'reject') {
    if (!summary)        return jsonErr('summary (reason) is required for Reject', 400, request);
    if (summary.length > 2000) return jsonErr('summary too long (max 2000 chars)', 400, request);
    if (blockingIssues.length > 2000) return jsonErr('blocking_issues too long', 400, request);
    if (toReconsider.length > 2000)   return jsonErr('to_reconsider too long', 400, request);
  } else {
    if (!confidence || !['Low', 'Medium', 'High'].includes(confidence)) {
      return jsonErr('confidence must be Low, Medium, or High', 400, request);
    }
    if (!summary)       return jsonErr('summary is required', 400, request);
    if (summary.length > 2000) return jsonErr('summary too long (max 2000 chars)', 400, request);
    if (nextStep.length > 2000)  return jsonErr('next_step too long', 400, request);
  }

  // 5. Duplicate vote check
  const existing = await env.DB.prepare(
    'SELECT decision FROM user_votes WHERE github_login = ? AND pr_id = ?',
  ).bind(session.github_login, prId).first<{ decision: string }>();
  if (existing) {
    return jsonErr(`You already voted ${existing.decision} on this PR`, 409, request);
  }

  // 6. PR existence + must be open
  const pr = await env.DB.prepare(
    `SELECT p.id, p.repo_id, p.repo_name, p.number, p.state
       FROM pull_requests p JOIN repos r ON r.id = p.repo_id
      WHERE p.id = ? AND p.deleted = 0 AND r.active = 1`,
  ).bind(prId).first<{
    id: number;
    repo_id: number | null;
    repo_name: string;
    number: number;
    state: string;
  }>();
  if (!pr) return jsonErr('PR not found', 404, request);
  if (pr.state !== 'open') return jsonErr('Voting is only allowed on open PRs', 409, request);

  // Resolve duplicate parents within the same immutable repository identity.
  if (decision === 'duplicate' && parentPrNumber) {
    if (pr.repo_id === null) return jsonErr('Repository identity is unavailable for this PR', 409, request);
    const parentPr = await env.DB.prepare(
      'SELECT id, duplicate_of FROM pull_requests WHERE repo_id = ? AND number = ?',
    ).bind(pr.repo_id, parentPrNumber).first<{ id: number; duplicate_of: number | null }>();
    if (!parentPr) return jsonErr(`Parent PR #${parentPrNumber} not found in ${pr.repo_name}`, 404, request);

    parentPrId = parentPr.id;

    // Walk the duplicate_of chain to find the canonical root
    let current = parentPr.duplicate_of;
    let hops = 0;
    const maxHops = 10;
    while (current && hops < maxHops) {
      const next = await env.DB.prepare(
        'SELECT duplicate_of FROM pull_requests WHERE id = ?',
      ).bind(current).first<{ duplicate_of: number | null }>();
      current = next?.duplicate_of ?? null;
      hops++;
    }
    resolvedParentId = current ?? parentPrId;
  }

  // 7. Build OASIS comment body matching comment_templates.md
  const decisionLabel = decision === 'accept' ? 'Accept' : decision === 'modify' ? 'Modify' : decision === 'reject' ? 'Reject' : 'Duplicate';
   let commentBody: string;
  if (decision === 'duplicate') {
    commentBody = [
      'Duplicate report:',
      '',
      '| | |',
      '| :-- | :-- |',
      `| Decision | ${decisionLabel} |`,
      `| Parent PR | #${parentPrNumber} |`,
      `| Notes | ${notes || '—'} |`,
    ].join('\n');
  } else if (decision === 'reject') {
    commentBody = [
      'Rejection summary:',
      '',
      '| | |',
      '| :-- | :-- |',
      `| Decision | ${decisionLabel} |`,
      `| Reason | ${summary || '—'} |`,
      `| Blocking issues | ${blockingIssues || '—'} |`,
      `| To reconsider | ${toReconsider || '—'} |`,
    ].join('\n');
  } else {
    commentBody = [
      'Validation summary:',
      '',
      '| | |',
      '| :-- | :-- |',
      `| Decision | ${decisionLabel} |`,
      `| Confidence | ${confidence} |`,
      `| Summary | ${summary || '—'} |`,
      `| Next step | ${nextStep || '—'} |`,
    ].join('\n');
  }

  // 8. POST to GitHub Issues API using the user's OAuth token
  let commentId: number | null = null;
  try {
    const ghRes = await fetch(
      `https://api.github.com/repos/${ORG}/${pr.repo_name}/issues/${pr.number}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.github_token}`,
          Accept:        'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent':  'oasis-worker-vote/1.0',
        },
        body: JSON.stringify({ body: commentBody }),
      },
    );
    if (ghRes.ok) {
      const ghComment = await ghRes.json() as { id?: number };
      commentId = ghComment.id ?? null;
    } else {
      const errText = await ghRes.text();
      console.error(`GitHub comment POST failed: ${ghRes.status} — ${errText}`);
      return jsonErr(`GitHub API error: ${ghRes.status}`, 502, request);
    }
  } catch (err) {
    console.error('GitHub comment POST error:', (err as Error)?.message);
    return jsonErr('Failed to post comment to GitHub', 502, request);
  }

  // 9. Write to D1 — all writes non-fatal individually so partial success is logged
  const now = new Date().toISOString();
  const decisionKey = decision as 'accept' | 'modify' | 'reject' | 'duplicate';

  // Upsert pr_participants
  try {
    const existing = await env.DB.prepare(
      'SELECT interactions, non_oasis_interactions, decision FROM pr_participants WHERE pr_id = ? AND login = ?',
    ).bind(pr.id, session.github_login).first<{
      interactions: number; non_oasis_interactions: number; decision: string | null
    }>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE pr_participants SET interactions = ?, decision = ? WHERE pr_id = ? AND login = ?`,
      ).bind(
        (existing.interactions ?? 0) + 1,
        decisionKey,
        pr.id,
        session.github_login,
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO pr_participants (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision, reactions_received)
         VALUES (?, ?, ?, ?, 1, 0, ?, 0)`,
      ).bind(pr.id, pr.repo_name, pr.number, session.github_login, decisionKey).run();
    }
  } catch (err) {
    console.error('pr_participants upsert error:', (err as Error)?.message);
  }

  // Increment pull_requests consensus count + oasis_comment_count + participants
  try {
    const consensusCol = decisionKey === 'accept'
      ? 'consensus_accept'
      : decisionKey === 'modify'
        ? 'consensus_modify'
        : decisionKey === 'reject'
          ? 'consensus_reject'
          : 'consensus_duplicate';

    // Atomically increment consensus + participant count via subquery (avoids TOCTOU race)
    // For duplicate votes, also check if consensus has been reached and set duplicate_of if needed
    await env.DB.prepare(
      `UPDATE pull_requests
       SET ${consensusCol} = ${consensusCol} + 1,
           oasis_comment_count = oasis_comment_count + 1,
           participants = (
             SELECT COUNT(*) FROM pr_participants WHERE pr_id = ? AND decision IS NOT NULL
           )
       WHERE id = ?`,
    ).bind(pr.id, pr.id).run();

    // For duplicate votes: check if consensus has been reached
    if (decisionKey === 'duplicate') {
      const counts = await env.DB.prepare(
        `SELECT consensus_accept, consensus_modify, consensus_reject, consensus_duplicate
         FROM pull_requests WHERE id = ?`,
      ).bind(pr.id).first<{
        consensus_accept: number;
        consensus_modify: number;
        consensus_reject: number;
        consensus_duplicate: number;
      }>();

      if (counts && counts.consensus_duplicate > Math.max(counts.consensus_accept, counts.consensus_modify, counts.consensus_reject)) {
        // Consensus reached on duplicate — find the most-cited parent PR among duplicate votes
        const parentCounts = await env.DB.prepare(
          `SELECT parent_pr_id, COUNT(*) as vote_count
           FROM user_votes WHERE pr_id = ? AND decision = 'duplicate'
           GROUP BY parent_pr_id
           ORDER BY vote_count DESC, voted_at ASC
           LIMIT 1`,
        ).bind(pr.id).first<{ parent_pr_id: number | null; vote_count: number }>();

        if (parentCounts?.parent_pr_id) {
          // Re-resolve the chain (in case parent's duplicate_of changed since votes were cast)
          let current = parentCounts.parent_pr_id;
          let hops = 0;
          const maxHops = 10;
          while (hops < maxHops) {
            const next = await env.DB.prepare(
              'SELECT duplicate_of FROM pull_requests WHERE id = ?',
            ).bind(current).first<{ duplicate_of: number | null }>();
            if (!next?.duplicate_of) break;
            current = next.duplicate_of;
            hops++;
          }
          await env.DB.prepare(
            `UPDATE pull_requests SET duplicate_of = ? WHERE id = ?`,
          ).bind(current, pr.id).run();
        }
      }
    }
  } catch (err) {
    console.error('pull_requests update error:', (err as Error)?.message);
  }

  // Upsert contributors
  try {
    const contrib = await env.DB.prepare(
      'SELECT prs_worked, total_interactions, accepts, modifies, rejects, duplicates FROM contributors WHERE login = ?',
    ).bind(session.github_login).first<{
      prs_worked: number; total_interactions: number;
      accepts: number; modifies: number; rejects: number; duplicates: number;
    }>();

    // Check if this user already had a participant row on another PR
    const prCount = await env.DB.prepare(
      "SELECT COUNT(DISTINCT pr_id) as c FROM pr_participants WHERE login = ? AND decision IS NOT NULL",
    ).bind(session.github_login).first<{ c: number }>();

    if (contrib) {
      await env.DB.prepare(
        `UPDATE contributors
         SET prs_worked = ?, total_interactions = total_interactions + 1,
             accepts = accepts + ?, modifies = modifies + ?, rejects = rejects + ?, duplicates = duplicates + ?,
             synced_at = ?
         WHERE login = ?`,
      ).bind(
        prCount?.c ?? 1,
        decisionKey === 'accept' ? 1 : 0,
        decisionKey === 'modify' ? 1 : 0,
        decisionKey === 'reject' ? 1 : 0,
        decisionKey === 'duplicate' ? 1 : 0,
        now,
        session.github_login,
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO contributors
           (login, avatar_url, prs_worked, total_interactions, non_oasis_interactions,
            reactions_received, accepts, modifies, rejects, duplicates, synced_at)
         VALUES (?, ?, ?, 1, 0, 0, ?, ?, ?, ?, ?)`,
      ).bind(
        session.github_login,
        session.avatar_url ?? `https://github.com/${session.github_login}.png?size=64`,
        prCount?.c ?? 1,
        decisionKey === 'accept' ? 1 : 0,
        decisionKey === 'modify' ? 1 : 0,
        decisionKey === 'reject' ? 1 : 0,
        decisionKey === 'duplicate' ? 1 : 0,
        now,
      ).run();
    }
  } catch (err) {
    console.error('contributors upsert error:', (err as Error)?.message);
  }

  // Insert user_votes record
  let voteRecorded = false;
  try {
    await env.DB.prepare(
      `INSERT INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, parent_pr_id, comment_id, voted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(session.github_login, pr.id, pr.repo_name, pr.number, decisionKey, parentPrId, commentId, now).run();
    voteRecorded = true;
  } catch (err) {
    console.error('user_votes insert error:', (err as Error)?.message);
  }

  if (voteRecorded) {
    try {
      await recordSubmittedVote(env.DB, pr.repo_id, now);
    } catch (err) {
      // Analytics must not change the authoritative vote outcome.
      console.error(JSON.stringify({
        event: 'engagement_vote_metric_failed',
        error: (err as Error)?.message ?? 'unknown_error',
      }));
    }
  }

  return jsonOk({ comment_id: commentId, decision: decisionKey, parent_pr_id: resolvedParentId }, request);
}

/* ─── GET /api/votes/mine ────────────────────────────────────── */
export async function handleMyVotes(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonOk({ votes: [] }, request);

  const rows = await env.DB.prepare(
    'SELECT pr_id, repo_name, pr_number, decision, comment_id, voted_at FROM user_votes WHERE github_login = ?',
  ).bind(session.github_login).all();

  return jsonOk({ votes: rows.results ?? [] }, request);
}
