/**
 * GitHub sync engine: full cron sync, chunked manual sync, shared PR processor.
 *
 * Data collection per PR:
 *   1. Fetch all comments → identify OASIS-template comments via parseDecision()
 *   2. For each OASIS comment: store pr_comments row, fetch reactions, store comment_reactions rows
 *   3. Track reactions_given per reactor (counts reactions they gave on OTHERS' comments)
 *   4. Detect upstream merges for closed PRs using the parent repo's commit API
 *
 * Reputation computation runs in rebuildContributors() after all PRs are processed.
 */

import type { Env, SyncResult, SyncStats, ParticipantData, PRResult } from './types.js';
import {
  setSyncState, rebuildContributors, rebuildDuplicates, syncVotesFromComments,
  closeOneResolvedDuplicate,
  upsertRepo, upsertPR, upsertParticipants, upsertComments, upsertReactions,
  updateRepoPRCount, getExistingMergedUpstream,
} from './db.js';
import {
  ORG, META_REPOS,
  ghFetch, ghFetchAll,
  parseDecision, parseDuplicateParent, parseDetectionTool, isAutomatedAccount, isValidatorBot, reactionPolarity,
  isHeadMergedUpstream, parseGitHubUrl,
  type GitHubRepo, type GitHubPR, type GitHubComment, type GitHubReaction,
} from './github.js';
import type { CommentData, ReactionData } from './types.js';
import { reconcileRepositoryPullRequests } from './cleanup.js';

/* ─── CHUNKED SYNC CONFIG ────────────────────────────────────── */
// Each bounded invocation processes one PR so GitHub collection remains well
// below the Workers Free external-subrequest ceiling.
// Cursor is stored in sync_state as "repoIndex:prStart".
const CHUNK_SIZE = 1;

/* ─── SHARED PR PROCESSOR ────────────────────────────────────── */
// Contains the inner-loop logic used by the request-bounded Workspace Workflow.
// Reactions are queued separately so this operation only collects one PR.
async function processPR(
  pr: GitHubPR,
  repoId: number,
  repoName: string,
  upstreamUrl: string | null,
  db: D1Database,
  token: string,
  syncStart: string,
  opts: { skipReactions: boolean; reactionJobRunId?: string; pipelineRunId?: string },
): Promise<PRResult> {
  const participantMap = new Map<string, ParticipantData>();
  const ensure = (login: string): ParticipantData => {
    if (!participantMap.has(login)) {
      participantMap.set(login, {
        interactions: 0,
        non_oasis_interactions: 0,
        decision: null,
        reactions_received: 0,
        reactions_given: 0,
      });
    }
    return participantMap.get(login)!;
  };

  const comments = await ghFetchAll<GitHubComment>(
    `/repos/${ORG}/${repoName}/issues/${pr.number}/comments`, token,
  );

  let consensusAccept = 0, consensusModify = 0, consensusReject = 0, consensusDuplicate = 0;
  let oasisCommentCount = 0, nonOasisCommentCount = 0;

  // Collect granular comment/reaction data for insertion into pr_comments / comment_reactions
  const commentRows: CommentData[] = [];
  const reactionRows: ReactionData[] = [];

  for (const comment of comments) {
    const login = comment.user?.login;

    // ── Validator-bot special path ────────────────────────────────
    // Validator bots (e.g. dryrun-security[bot]) post real OASIS-template comments
    // with accept/modify/reject decisions. We write their pr_comments rows (and fetch
    // reactions) so the validate-tools leaderboard can count them, but we skip
    // pr_participants and contributors tracking — they are not human contributors.
    if (login && isValidatorBot(login)) {
      const decision = parseDecision(comment.body);
      if (decision) {
        oasisCommentCount++;
        if (decision === 'accept') consensusAccept++;
        if (decision === 'modify') consensusModify++;
        if (decision === 'reject') consensusReject++;
        if (decision === 'duplicate') consensusDuplicate++;
        
        const duplicateOf = decision === 'duplicate' ? parseDuplicateParent(comment.body) ?? undefined : undefined;
        commentRows.push({
          id: comment.id,
          prId: pr.id,
          repoName,
          prNumber: pr.number,
          login,
          decision,
          duplicateOf,
          createdAt: comment.created_at,
          prCreatedAt: pr.created_at,
        });
        if (!opts.skipReactions) {
          try {
            const reactions = await ghFetchAll<GitHubReaction>(
              `/repos/${ORG}/${repoName}/issues/comments/${comment.id}/reactions`, token,
            );
            for (const rxn of reactions) {
              const rLogin = rxn.user?.login;
              if (!rLogin || rLogin === login || isAutomatedAccount(rLogin)) continue;
              // Reactions on validator-bot comments count toward consensus weighting
              if (rxn.content === '+1') {
                if (decision === 'accept') consensusAccept++;
                if (decision === 'modify') consensusModify++;
                if (decision === 'reject') consensusReject++;
                if (decision === 'duplicate') consensusDuplicate++;
              }
              // Store reaction row for potential future use (peer_score not applied to bots)
              const polarity = reactionPolarity(rxn.content);
              reactionRows.push({
                commentId: comment.id,
                reactor: rLogin,
                content: rxn.content,
                isPositive: polarity === 'positive',
              });
            }
          } catch { /* skip — non-fatal */ }
        }
      }
      continue; // skip pr_participants tracking for validator bots
    }

    // Skip all other automated/bot accounts — they must not appear in any OASIS tracking
    if (!login || isAutomatedAccount(login)) continue;
    const p = ensure(login);
    const decision = parseDecision(comment.body);

    if (decision) {
      // OASIS-template comment — counts toward interactions, consensus, and trust
      p.interactions++;
      p.decision = decision;
      oasisCommentCount++;
      if (decision === 'accept') consensusAccept++;
      if (decision === 'modify') consensusModify++;
      if (decision === 'reject') consensusReject++;
      if (decision === 'duplicate') consensusDuplicate++;

      // For duplicate votes, parse the parent PR ID
      const duplicateOf = decision === 'duplicate' ? parseDuplicateParent(comment.body) ?? undefined : undefined;

      // Store per-comment record for bonus computation and contribution history
      commentRows.push({
        id: comment.id,
        prId: pr.id,
        repoName,
        prNumber: pr.number,
        login,
        decision,
        duplicateOf,
        createdAt: comment.created_at,
        prCreatedAt: pr.created_at,
      });

      // Reactions are only fetched for OASIS-template comments.
      // Skipped on manual sync to stay within the 50-subrequest limit;
      // the cron (1000-subrequest limit) always fetches them.
      if (!opts.skipReactions) {
        try {
          const reactions = await ghFetchAll<GitHubReaction>(
            `/repos/${ORG}/${repoName}/issues/comments/${comment.id}/reactions`, token,
          );
          for (const rxn of reactions) {
            const rLogin = rxn.user?.login;
            // Skip self-reactions, bots, and automated accounts
            if (!rLogin || rLogin === login || isAutomatedAccount(rLogin)) continue;

            p.reactions_received++;

            // Consensus weighting: +1 reactions on OASIS comments count toward consensus
            if (rxn.content === '+1' && decision) {
              if (decision === 'accept') consensusAccept++;
              if (decision === 'modify') consensusModify++;
              if (decision === 'reject') consensusReject++;
              if (decision === 'duplicate') consensusDuplicate++;
            }

            // Track how many reactions this reactor has GIVEN (for reaction_score)
            ensure(rLogin).reactions_given++;

            // Store per-reaction record for peer_score computation
            const polarity = reactionPolarity(rxn.content);
            reactionRows.push({
              commentId: comment.id,
              reactor: rLogin,
              content: rxn.content,
              isPositive: polarity === 'positive',
            });
          }
        } catch { /* skip — non-fatal */ }
      }
    } else {
      // Non-OASIS comment — tracked separately, does NOT affect reputation,
      // consensus, trust status, or contributor counts
      p.non_oasis_interactions++;
      nonOasisCommentCount++;
      // skip reactions fetch — non-OASIS engagement is not credited
    }
  }

  // participants = only those who left at least one OASIS-template comment
  const oasisParticipantCount = [...participantMap.values()].filter(p => p.decision !== null).length;
  const detectionTool = parseDetectionTool(pr.body);

  // ── Upstream merge detection ─────────────────────────────────
  // If the PR is closed/merged and we don't already have merged_upstream=1,
  // check whether the head commit exists in the upstream (parent) repo.
  // This powers trust_score: contributors who voted 'accept' on an upstream-merged PR earn +10.
  let mergedUpstream = await getExistingMergedUpstream(db, repoId, pr.number);
  if (mergedUpstream === 0 && pr.merged_at && pr.head?.sha && upstreamUrl) {
    const parsed = parseGitHubUrl(upstreamUrl);
    if (parsed) {
      const isMerged = await isHeadMergedUpstream(parsed.owner, parsed.repo, pr.head.sha, token);
      if (isMerged) mergedUpstream = 1;
    }
  }

  // Note: upsertPR is called without consensusDuplicate because the duplicate_of field
  // is managed separately via rebuildDuplicates(), which runs after all PR syncs complete.
  // This allows consensus to be checked and chain resolution to handle transitive updates.
  await upsertPR(
    db, pr, repoId, repoName, comments.length,
    oasisCommentCount, nonOasisCommentCount,
    oasisParticipantCount, consensusAccept, consensusModify, consensusReject,
    mergedUpstream, detectionTool, syncStart,
  );

  await upsertParticipants(db, pr.id, repoName, pr.number, participantMap);

  // Write granular comment/reaction rows (used by rebuildContributors for bonus computation)
  if (commentRows.length > 0) {
    await upsertComments(db, commentRows);
    if (opts.pipelineRunId && opts.reactionJobRunId) {
      const queuedAt = new Date().toISOString();
      await db.batch(commentRows.map(comment => db.prepare(`
        INSERT OR IGNORE INTO sync_work_items (
          id, pipeline_run_id, job_run_id, job_key, entity_type, entity_id,
          payload_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'comment_reactions', 'comment', ?, '{}', 'pending', ?, ?)
      `).bind(
        `${opts.pipelineRunId}:reaction:${comment.id}`,
        opts.pipelineRunId,
        opts.reactionJobRunId,
        String(comment.id),
        queuedAt,
        queuedAt,
      )));
    }
  }
  if (reactionRows.length > 0) {
    await upsertReactions(db, reactionRows);
  }

  return { comments: comments.length };
}

/* ─── CHUNKED WORKSPACE SYNC (one PR per invocation) ──────────── */
// Cursor stored in sync_state as "repoIndex:prStart", e.g. "0:10".
// Each call processes up to CHUNK_SIZE PRs from the current repo, then advances.
// When all PRs in a repo are done, moves to next repo.
// When all repos done, runs rebuildContributors and marks sync complete.
export async function runSyncOneRepo(
  env: Env,
  opts: {
    skipReactions?: boolean;
    reactionJobRunId?: string;
    pipelineRunId?: string;
    deferFinalization?: boolean;
  } = {},
): Promise<SyncResult> {
  const { skipReactions = true } = opts;
  const token = env.GITHUB_TOKEN;
  const db    = env.DB;
  const stats: SyncStats = { repos: 0, prs: 0, comments: 0 };

  try {
    const syncStart = new Date().toISOString();

    // Fetch repo list (1 subrequest)
    const allRepos = await ghFetchAll<GitHubRepo>(`/orgs/${ORG}/repos?type=public`, token);
    const repos    = allRepos.filter(r => r.fork && !META_REPOS.has(r.name));

    if (repos.length === 0) {
      return { ok: true, message: 'No repos to sync', stats, done: true };
    }

    // Parse cursor "repoIndex:prStart"
    const cursorRow = await db.prepare("SELECT value FROM sync_state WHERE key = 'sync_cursor'")
      .first<{ value: string }>();
    let repoIdx = 0, prStart = 0;
    if (cursorRow?.value) {
      const parts = cursorRow.value.split(':');
      repoIdx  = parseInt(parts[0], 10) || 0;
      prStart  = parseInt(parts[1], 10) || 0;
    }

     // All repos processed — rebuild contributors and finish
     if (repoIdx >= repos.length) {
       if (opts.deferFinalization) {
         await db.prepare("DELETE FROM sync_state WHERE key = 'sync_cursor'").run();
         return { ok: true, message: 'Repository and pull request collection complete', stats, done: true };
       }
       // Sync user votes from pr_comments before resolving duplicates
       // (so duplicate chain resolution has complete vote data)
       await syncVotesFromComments(db);
       
       // Resolve duplicate PR chains and auto-close PRs when consensus + merged parent
       await rebuildDuplicates(db, token);
       
       // Rebuild contributor reputation scores
       await rebuildContributors(db, syncStart);
       
       await setSyncState(db, 'last_synced_at', syncStart);
       await setSyncState(db, 'sync_running', '0');
       await db.prepare("DELETE FROM sync_state WHERE key = 'sync_cursor'").run();
       return { ok: true, message: `Sync complete at ${syncStart}`, stats, done: true };
     }

    const repo = repos[repoIdx];
    let upstreamUrl: string | null = null;

    // First chunk for this repo: upsert repo row + fetch PR list
    let repoSince: string;
    if (prStart === 0) {
      const detail = await ghFetch<{ parent?: { html_url: string } }>(`/repos/${ORG}/${repo.name}`, token);
      upstreamUrl  = detail.parent?.html_url ?? null;
      // Get the previous sync timestamp for this repo (or epoch if new)
      const existingRepo = await db.prepare('SELECT synced_at FROM repos WHERE id = ?')
        .bind(repo.id).first<{ synced_at: string | null }>();
      repoSince = existingRepo?.synced_at ?? '1970-01-01T00:00:00Z';
      await upsertRepo(db, repo, upstreamUrl, repoSince);
      stats.repos++;
    } else {
      // Subsequent chunks: read upstream_url and synced_at from DB (already stored on first chunk)
      const repoRow = await db.prepare('SELECT upstream_url, synced_at FROM repos WHERE id = ?')
        .bind(repo.id).first<{ upstream_url: string | null; synced_at: string | null }>();
      upstreamUrl = repoRow?.upstream_url ?? null;
      repoSince = repoRow?.synced_at ?? '1970-01-01T00:00:00Z';
    }

    // Fetch all PRs for this repo (1-2 subrequests, paginated)
    const openPRs   = await ghFetchAll<GitHubPR>(`/repos/${ORG}/${repo.name}/pulls?state=open&sort=updated&direction=desc`, token);
    const closedPRs = await ghFetchAll<GitHubPR>(`/repos/${ORG}/${repo.name}/pulls?state=closed&sort=updated&direction=desc`, token);
    const repositoryPRs = [...openPRs, ...closedPRs];
    const allPRs = repositoryPRs.filter(pr => pr.updated_at >= repoSince);

    // Slice this chunk
    const chunk   = allPRs.slice(prStart, prStart + CHUNK_SIZE);
    const prEnd   = prStart + chunk.length;
    const hasMore = prEnd < allPRs.length;

    for (const pr of chunk) {
      stats.prs++;
      const result = await processPR(pr, repo.id, repo.name, upstreamUrl, db, token, syncStart, {
        skipReactions,
        reactionJobRunId: opts.reactionJobRunId,
        pipelineRunId: opts.pipelineRunId,
      });
      stats.comments += result.comments;
    }

    // After last chunk for this repo: update open_prs count
    if (!hasMore) {
      const inventoryCleanup = await reconcileRepositoryPullRequests(
        db,
        repo.id,
        repositoryPRs.map(pr => pr.id),
      );
      console.log(JSON.stringify({
        event: 'repository_pull_request_inventory_reconciled',
        repository_id: repo.id,
        checked: inventoryCleanup.checked,
        flagged: inventoryCleanup.flagged,
      }));
      const finalSyncedAt = repositoryPRs[0]?.updated_at ?? syncStart;
      await updateRepoPRCount(db, repo.id, syncStart, finalSyncedAt);
    }

    // Advance cursor
    const nextRepoIdx  = hasMore ? repoIdx : repoIdx + 1;
    const nextPrStart  = hasMore ? prEnd : 0;
    await setSyncState(db, 'sync_cursor', `${nextRepoIdx}:${nextPrStart}`);

    const reposLeft = repos.length - nextRepoIdx;
    const prsLeft   = hasMore ? allPRs.length - prEnd : 0;
    const msg = hasMore
      ? `Repo ${repoIdx + 1}/${repos.length} (${repo.name}): PRs ${prStart + 1}–${prEnd}/${allPRs.length}. ${prsLeft} PRs remaining in this repo.`
      : nextRepoIdx < repos.length
        ? `Repo ${repoIdx + 1}/${repos.length} (${repo.name}) done. ${reposLeft} repo(s) remaining.`
        : `All repos done. Call once more to rebuild contributors and finish.`;

    return { ok: true, message: msg, stats, done: false, cursor: `${nextRepoIdx}:${nextPrStart}`, total_repos: repos.length };
  } catch (err) {
    await setSyncState(db, 'sync_running', '0');
    return { ok: false, message: (err as Error)?.message ?? String(err), stats };
  }
}

/** Processes exactly one queued comment-reaction work item. */
export async function runSyncOneCommentReaction(
  env: Env,
  pipelineRunId: string,
): Promise<{ done: boolean; reactions: number }> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE sync_work_items
       SET status = 'pending', leased_at = NULL, lease_expires_at = NULL, updated_at = ?
     WHERE pipeline_run_id = ? AND job_key = 'comment_reactions'
       AND status = 'processing' AND lease_expires_at <= ?
  `).bind(now, pipelineRunId, now).run();
  const item = await env.DB.prepare(`
    SELECT wi.id, wi.entity_id, pc.repo_name, pc.login
      FROM sync_work_items wi
      JOIN pr_comments pc ON CAST(pc.id AS TEXT) = wi.entity_id
     WHERE wi.pipeline_run_id = ?
       AND wi.job_key = 'comment_reactions'
       AND wi.status = 'pending'
     ORDER BY CAST(wi.entity_id AS INTEGER)
     LIMIT 1
  `).bind(pipelineRunId).first<{
    id: string;
    entity_id: string;
    repo_name: string;
    login: string;
  }>();
  if (!item) return { done: true, reactions: 0 };

  const claimedAt = new Date().toISOString();
  const claim = await env.DB.prepare(`
    UPDATE sync_work_items
       SET status = 'processing', attempts = attempts + 1, leased_at = ?,
           lease_expires_at = ?, updated_at = ?
     WHERE id = ? AND status = 'pending'
  `).bind(
    claimedAt,
    new Date(Date.now() + 15 * 60_000).toISOString(),
    claimedAt,
    item.id,
  ).run();
  if ((claim.meta.changes ?? 0) !== 1) return { done: false, reactions: 0 };

  try {
    const commentId = Number(item.entity_id);
    const reactions = await ghFetchAll<GitHubReaction>(
      `/repos/${ORG}/${item.repo_name}/issues/comments/${commentId}/reactions`,
      env.GITHUB_TOKEN,
    );
    const rows: ReactionData[] = [];
    for (const reaction of reactions) {
      const reactor = reaction.user?.login;
      if (!reactor || reactor === item.login || isAutomatedAccount(reactor)) continue;
      rows.push({
        commentId,
        reactor,
        content: reaction.content,
        isPositive: reactionPolarity(reaction.content) === 'positive',
      });
    }
    await env.DB.prepare('DELETE FROM comment_reactions WHERE comment_id = ?').bind(commentId).run();
    if (rows.length > 0) await upsertReactions(env.DB, rows);
    await env.DB.prepare(`
      UPDATE sync_work_items
         SET status = 'succeeded', leased_at = NULL, lease_expires_at = NULL,
             last_error_code = NULL, last_error_summary = NULL, updated_at = ?
       WHERE id = ?
    `).bind(new Date().toISOString(), item.id).run();
    return { done: false, reactions: rows.length };
  } catch (error) {
    await env.DB.prepare(`
      UPDATE sync_work_items
         SET status = 'pending', leased_at = NULL, lease_expires_at = NULL,
             last_error_code = 'reaction_sync_failed', last_error_summary = ?, updated_at = ?
       WHERE id = ?
    `).bind(
      error instanceof Error ? error.message.slice(0, 500) : 'Reaction sync failed',
      new Date().toISOString(),
      item.id,
    ).run();
    throw error;
  }
}

/** Rebuilds reaction-derived denormalized counts after the reaction queue drains. */
export async function rebuildReactionDerivedCounts(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      UPDATE pr_participants
         SET reactions_received = (
           SELECT COUNT(*)
             FROM pr_comments pc
             JOIN comment_reactions cr ON cr.comment_id = pc.id
            WHERE pc.pr_id = pr_participants.pr_id
              AND pc.login = pr_participants.login
         )
    `),
    db.prepare(`
      UPDATE pull_requests
         SET consensus_accept = (
               SELECT COUNT(*) + COALESCE(SUM((SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = pc.id AND cr.content = '+1')), 0)
                 FROM pr_comments pc WHERE pc.pr_id = pull_requests.id AND pc.decision = 'accept'
             ),
             consensus_modify = (
               SELECT COUNT(*) + COALESCE(SUM((SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = pc.id AND cr.content = '+1')), 0)
                 FROM pr_comments pc WHERE pc.pr_id = pull_requests.id AND pc.decision = 'modify'
             ),
             consensus_reject = (
               SELECT COUNT(*) + COALESCE(SUM((SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = pc.id AND cr.content = '+1')), 0)
                 FROM pr_comments pc WHERE pc.pr_id = pull_requests.id AND pc.decision = 'reject'
             )
    `),
  ]);
}

/** Prepares database projections and resolved duplicate relationships without GitHub writes. */
export async function prepareCanonicalProjections(env: Env): Promise<void> {
  await rebuildReactionDerivedCounts(env.DB);
  await syncVotesFromComments(env.DB);
  await rebuildDuplicates(env.DB, env.GITHUB_TOKEN, { skipGitHubMutations: true });
}

export async function closeCanonicalDuplicate(env: Env): Promise<{ done: boolean; closed: number }> {
  return closeOneResolvedDuplicate(env.DB, env.GITHUB_TOKEN);
}

/** Finalizes database-only contributor projections after bounded GitHub writes drain. */
export async function finalizeCanonicalSync(env: Env): Promise<void> {
  const completedAt = new Date().toISOString();
  await rebuildContributors(env.DB, completedAt);
  await setSyncState(env.DB, 'last_synced_at', completedAt);
  await setSyncState(env.DB, 'sync_running', '0');
}
