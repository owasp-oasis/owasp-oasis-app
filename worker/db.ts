/**
 * D1 database helpers: sync state, duplicate checks, contributor rebuild.
 *
 * rebuildContributors() is the core reputation engine. It runs after every sync
 * and computes all score columns on the contributors table from scratch using
 * pr_comments and comment_reactions as the source of truth.
 *
 * ── REPUTATION FORMULA ────────────────────────────────────────────────────────
 *
 *   base_reputation = comment_score + peer_score + reaction_score + trust_score
 *   modified_reputation = base_reputation × (1 + total_bonus)
 *
 *   where total_bonus = Σ(early_mover_bonus + early_bird_bonus + influencer_bonus)
 *                       summed over all of the contributor's OASIS comments
 *
 * Score components:
 *
 *   comment_score     = count of OASIS-template comments posted by the contributor
 *                       (1 point per comment)
 *
 *   peer_score        = Σ peer_agreement over all reactions on contributor's comments
 *                       peer_agreement = 0.25 (base)
 *                                      + 0.10 if positive reaction (+1/heart/hooray/rocket/laugh)
 *                                      − 0.50 if negative reaction (−1/confused)
 *                       Self-reactions and bot reactions are excluded at sync time.
 *
 *   reaction_score    = min(reactions_given, 5) × 0.25   (max = 1.25)
 *                       Capped at 5 to prevent farming. Counts reactions the contributor
 *                       GAVE on other people's OASIS comments.
 *
 *   trust_score       = 10 × count(PRs where contributor voted 'accept' AND merged_upstream = 1)
 *                       Rewards contributors who correctly identify upstream-mergeable vulnerabilities.
 *
 * Bonus factors (multiplicative, additive per comment, then summed):
 *
 *   early_mover_bonus (per comment, applied only to PRs older than 72 hours at sync time):
 *     N = total OASIS comments on the PR
 *     rank comments by created_at ASC (1 = earliest)
 *     Bucket 1: rank ≤ max(1, floor(N × 0.01))        → +0.20
 *     Bucket 2: next floor(N × 0.09) ranks             → +0.10
 *     Bucket 3: next floor(N × 0.15) ranks             → +0.05
 *     else                                             → 0
 *
 *   early_bird_bonus (per comment):
 *     hours = (comment.created_at − pr.created_at) in hours
 *     ≤ 24h                                           → +0.25
 *     > 24h and ≤ 96h                                 → +0.10
 *     > 96h                                           → 0
 *
 *   influencer_bonus (per PR, assigned to comments with top reaction counts):
 *     Most total reactions on the PR   → +0.10  (one comment; ties go to earliest)
 *     Most positive reactions on the PR → +0.20  (one comment; ties go to earliest)
 *     Most negative reactions on the PR → −0.50  (one comment; ties go to earliest)
 *     A comment can hold multiple influencer titles simultaneously.
 *
 * 90-day rank:
 *   Same formula, but restricted to pr_comments.created_at >= now − 90 days.
 *   Stored as rank_90d (INTEGER, NULL if no 90-day activity) and
 *   rank_90d_oldest_activity (ISO-8601: oldest activity in the window).
 *   Recalculated every cron sync. Consumers can use rank_90d_oldest_activity
 *   to know when a contributor's 90-day rank will next change.
 */

import type { ParticipantData, CommentData, ReactionData } from './types.js';
import { isValidatorBot } from './github.js';

/* ─── SYNC STATE ─────────────────────────────────────────────── */
export async function getSyncState(db: D1Database, key: string): Promise<string> {
  const row = await db.prepare('SELECT value FROM sync_state WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? '2020-01-01T00:00:00Z';
}

export async function setSyncState(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').bind(key, value).run();
}

/* ─── MISC HELPERS ───────────────────────────────────────────── */
export async function isEmailRegistered(db: D1Database, email: string): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT id FROM registrations WHERE email = ? LIMIT 1').bind(email).first();
    return !!row;
  } catch { return false; }
}

/* ─── REPO / PR / PARTICIPANT UPSERTS ───────────────────────── */
export async function upsertRepo(
  db: D1Database,
  repo: {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
  },
  upstreamUrl: string | null,
  syncStart: string,
): Promise<void> {
  await db.prepare(`
    INSERT OR REPLACE INTO repos (id, name, full_name, description, language, open_prs, stars, upstream_url, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    repo.id, repo.name, repo.full_name, repo.description ?? null,
    repo.language ?? null, 0, repo.stargazers_count, upstreamUrl, syncStart,
  ).run();
}

export async function upsertPR(
  db: D1Database,
  pr: {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    head?: { sha?: string };
    merged_at?: string | null;
    created_at: string;
    updated_at: string;
    user?: { login?: string };
  },
  repoName: string,
  commentCount: number,
  oasisCommentCount: number,
  nonOasisCommentCount: number,
  oasisParticipantCount: number,
  consensusAccept: number,
  consensusModify: number,
  consensusReject: number,
  mergedUpstream: number,
  detectionTool: string | null,
  syncStart: string,
): Promise<void> {
  const state = pr.state === 'open' ? 'open' : 'closed';
  
  // Preserve duplicate_of and closed_as_duplicate from existing row (if any)
  const existing = await db.prepare(
    'SELECT duplicate_of, closed_as_duplicate FROM pull_requests WHERE id = ?'
  ).bind(pr.id).first<{ duplicate_of: number | null; closed_as_duplicate: number }>();

  await db.prepare(`
    INSERT OR REPLACE INTO pull_requests
      (id, repo_name, number, title, state, author, html_url, comment_count,
       oasis_comment_count, non_oasis_comment_count,
       participants, consensus_accept, consensus_modify, consensus_reject,
       duplicate_of, closed_as_duplicate, merged_upstream, head_sha, merged_at, created_at, updated_at, detection_tool, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    pr.id, repoName, pr.number, pr.title, state,
    pr.user?.login ?? null, pr.html_url, commentCount,
    oasisCommentCount, nonOasisCommentCount,
    oasisParticipantCount, consensusAccept, consensusModify, consensusReject,
    existing?.duplicate_of ?? null, existing?.closed_as_duplicate ?? 0,
    mergedUpstream, pr.head?.sha ?? null, pr.merged_at ?? null,
    pr.created_at, pr.updated_at, detectionTool, syncStart,
  ).run();
}

export async function upsertParticipants(
  db: D1Database,
  prId: number,
  repoName: string,
  prNumber: number,
  participantMap: Map<string, ParticipantData>,
): Promise<void> {
  for (const [login, data] of participantMap.entries()) {
    await db.prepare(`
      INSERT OR REPLACE INTO pr_participants
        (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision, reactions_received)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(prId, repoName, prNumber, login, data.interactions, data.non_oasis_interactions, data.decision ?? null, data.reactions_received).run();
  }
}

/**
 * Upsert per-comment records into pr_comments.
 * Called after each PR is processed in sync; only OASIS-template comments are stored here.
 */
export async function upsertComments(db: D1Database, comments: CommentData[]): Promise<void> {
  for (const c of comments) {
    await db.prepare(`
      INSERT OR REPLACE INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, duplicate_of, created_at, pr_created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(c.id, c.prId, c.repoName, c.prNumber, c.login, c.decision ?? null, c.duplicateOf ?? null, c.createdAt, c.prCreatedAt).run();
  }
}

/**
 * Upsert per-reaction records into comment_reactions.
 * Called after each PR is processed in sync (only on cron, not manual chunked sync).
 * Existing rows with the same (comment_id, reactor, content) are replaced.
 */
export async function upsertReactions(db: D1Database, reactions: ReactionData[]): Promise<void> {
  for (const r of reactions) {
    await db.prepare(`
      INSERT OR REPLACE INTO comment_reactions (comment_id, reactor, content, is_positive)
      VALUES (?, ?, ?, ?)
    `).bind(r.commentId, r.reactor, r.content, r.isPositive ? 1 : 0).run();
  }
}

export async function updateRepoPRCount(db: D1Database, repoName: string, syncStart: string, syncedAt?: string): Promise<void> {
  const openCount = await db.prepare(
    "SELECT COUNT(*) as c FROM pull_requests WHERE repo_name = ? AND state = 'open'",
  ).bind(repoName).first<{ c: number }>();
  const duplicateCount = await db.prepare(
    "SELECT COUNT(*) as c FROM pull_requests WHERE repo_name = ? AND duplicate_of IS NOT NULL",
  ).bind(repoName).first<{ c: number }>();
   await db.prepare('UPDATE repos SET open_prs = ?, duplicate_count = ?, synced_at = ? WHERE name = ?')
     .bind(openCount?.c ?? 0, duplicateCount?.c ?? 0, syncedAt ?? syncStart, repoName).run();
 }

/**
 * Syncs user votes from pr_comments after all PRs have been processed by sync.
 * Called after all comments are upserted but BEFORE rebuildDuplicates() so that
 * duplicate chain resolution has access to complete vote data.
 *
 * For each non-validator-bot OASIS-template comment:
 *   - Insert a corresponding user_votes record
 *   - For duplicate decisions, resolve the parent PR number to its database ID
 *   - Skip validator bots (they shouldn't have user_votes entries)
 *   - Use INSERT OR IGNORE to preserve existing UI-cast votes (which are timestamped at vote time, not comment time)
 *
 * This ensures user_votes stays in sync with pr_comments, so both tables
 * reflect the same source of truth from GitHub.
 */
export async function syncVotesFromComments(db: D1Database): Promise<void> {
  // Fetch all OASIS-template comments that aren't from validator bots or automated accounts
  const comments = await db.prepare(`
    SELECT
      pc.id,
      pc.login,
      pc.pr_id,
      pc.repo_name,
      pc.pr_number,
      pc.decision,
      pc.duplicate_of,
      pc.created_at
    FROM pr_comments pc
    WHERE pc.decision IS NOT NULL
  `).all<{
    id: number;
    login: string;
    pr_id: number;
    repo_name: string;
    pr_number: number;
    decision: string;
    duplicate_of: number | null;
    created_at: string;
  }>();

  // Process each comment and insert into user_votes, skipping validator bots
  for (const comment of comments.results ?? []) {
    // Skip validator bots and automated accounts
    if (isValidatorBot(comment.login)) continue;

    // For duplicate votes, resolve the parent PR's database ID
    let parentPrId: number | null = null;
    if (comment.decision === 'duplicate' && comment.duplicate_of) {
      const parentPr = await db.prepare(
        'SELECT id FROM pull_requests WHERE repo_name = ? AND number = ?',
      ).bind(comment.repo_name, comment.duplicate_of).first<{ id: number }>();
      parentPrId = parentPr?.id ?? null;
    }

    // INSERT OR IGNORE preserves any existing UI-cast votes (they have higher priority)
    await db.prepare(`
      INSERT OR IGNORE INTO user_votes
        (github_login, pr_id, repo_name, pr_number, decision, parent_pr_id, voted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      comment.login,
      comment.pr_id,
      comment.repo_name,
      comment.pr_number,
      comment.decision,
      parentPrId,
      comment.created_at,
    ).run();
  }
}

 /**
  * Rebuilds the duplicate relationship chains for all PRs with duplicate votes.
 * For each PR with duplicate votes, re-resolves the chain and updates pull_requests.duplicate_of
 * to point to the canonical root (in case parent's duplicate_of changed since votes were cast).
 * Also handles auto-closing PRs when consensus + merged parent.
 */
export async function rebuildDuplicates(db: D1Database, token: string): Promise<{ closed: number }> {
  let closedCount = 0;

  // Get all PRs with duplicate votes
  const prsWithDuplicates = await db.prepare(`
    SELECT DISTINCT pr_id FROM user_votes WHERE decision = 'duplicate'
  `).all<{ pr_id: number }>();

  for (const row of prsWithDuplicates.results ?? []) {
    const pr = await db.prepare(`
      SELECT id, repo_name, number, state, duplicate_of FROM pull_requests WHERE id = ?
    `).bind(row.pr_id).first<{
      id: number; repo_name: string; number: number; state: string; duplicate_of: number | null;
    }>();

    if (!pr) continue;

    // Get duplicate vote counts
    const counts = await db.prepare(`
      SELECT consensus_accept, consensus_modify, consensus_reject, consensus_duplicate
      FROM pull_requests WHERE id = ?
    `).bind(pr.id).first<{
      consensus_accept: number;
      consensus_modify: number;
      consensus_reject: number;
      consensus_duplicate: number;
    }>();

    // If consensus not reached on duplicate, skip
    if (!counts || counts.consensus_duplicate <= Math.max(counts.consensus_accept, counts.consensus_modify, counts.consensus_reject)) {
      // Clear duplicate_of if consensus lost
      await db.prepare('UPDATE pull_requests SET duplicate_of = NULL WHERE id = ?').bind(pr.id).run();
      continue;
    }

    // Find the most-cited parent among duplicate votes
    const parentCounts = await db.prepare(`
      SELECT parent_pr_id, COUNT(*) as vote_count
      FROM user_votes WHERE pr_id = ? AND decision = 'duplicate' AND parent_pr_id IS NOT NULL
      GROUP BY parent_pr_id
      ORDER BY vote_count DESC, voted_at ASC
      LIMIT 1
    `).bind(pr.id).first<{ parent_pr_id: number | null; vote_count: number }>();

    if (!parentCounts?.parent_pr_id) continue;

    // Resolve the chain to the canonical root
    let current = parentCounts.parent_pr_id;
    let hops = 0;
    const maxHops = 10;
    while (hops < maxHops) {
      const next = await db.prepare(
        'SELECT duplicate_of FROM pull_requests WHERE id = ?',
      ).bind(current).first<{ duplicate_of: number | null }>();
      if (!next?.duplicate_of) break;
      current = next.duplicate_of;
      hops++;
    }

    // Update duplicate_of to the resolved root
    await db.prepare('UPDATE pull_requests SET duplicate_of = ? WHERE id = ?').bind(current, pr.id).run();

    // Check if parent is merged/closed — if so, auto-close this PR
    const parent = await db.prepare(`
      SELECT id, state, merged_at FROM pull_requests WHERE id = ?
    `).bind(current).first<{ id: number; state: string; merged_at: string | null }>();

    if (parent && (parent.merged_at || parent.state === 'closed')) {
      // Only close if PR is still open
      if (pr.state === 'open') {
        try {
          // Post a comment to GitHub
          const commentBody = `This PR has been classified as a duplicate of #${parent.id} which has been merged upstream. Closing as duplicate.`;
          await fetch(
            `https://api.github.com/repos/owasp-oasis/${pr.repo_name}/issues/${pr.number}/comments`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'User-Agent': 'oasis-worker-sync/1.0',
              },
              body: JSON.stringify({ body: commentBody }),
            },
          );

          // Close the PR via GitHub API
          await fetch(
            `https://api.github.com/repos/owasp-oasis/${pr.repo_name}/pulls/${pr.number}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'User-Agent': 'oasis-worker-sync/1.0',
              },
              body: JSON.stringify({ state: 'closed' }),
            },
          );

          // Mark in D1 as closed-as-duplicate
          await db.prepare(
            'UPDATE pull_requests SET closed_as_duplicate = 1, state = ? WHERE id = ?',
          ).bind('closed', pr.id).run();
          closedCount++;
        } catch (err) {
          console.error(`Failed to auto-close PR #${pr.number} in ${pr.repo_name}:`, (err as Error)?.message);
        }
      }
    }
  }

  return { closed: closedCount };
}

export async function getExistingMergedUpstream(db: D1Database, repoName: string, prNumber: number): Promise<number> {
  const row = await db.prepare('SELECT merged_upstream FROM pull_requests WHERE repo_name = ? AND number = ?')
    .bind(repoName, prNumber).first<{ merged_upstream: number }>();
  return row?.merged_upstream ?? 0;
}

/* ─── REPUTATION ENGINE ──────────────────────────────────────── */

// Internal types for reputation computation
interface ScoreRow {
  login: string;
  comment_score: number;
  peer_score: number;
  reaction_score: number;
  trust_score: number;
}

interface CommentRow {
  id: number;
  pr_id: number;
  login: string;
  created_at: string;
  pr_created_at: string;
  total_reactions: number;
  positive_reactions: number;
  negative_reactions: number;
}

interface BonusAccum {
  early_mover: number;
  early_bird: number;
  influencer: number;
}

/**
 * Computes per-comment bonus factors for all contributors.
 *
 * @param db - D1 database handle
 * @param since - Optional ISO-8601 cutoff; only comments after this date are included.
 *                Pass null for all-time computation.
 * @returns Map from login → { early_mover, early_bird, influencer } accumulated bonus factors
 */
async function computeBonuses(
  db: D1Database,
  since: string | null,
): Promise<Map<string, BonusAccum>> {
  const bonusMap = new Map<string, BonusAccum>();
  const getBonus = (login: string): BonusAccum => {
    if (!bonusMap.has(login)) bonusMap.set(login, { early_mover: 0, early_bird: 0, influencer: 0 });
    return bonusMap.get(login)!;
  };

  // Load all OASIS comments with their reaction summary
  // If `since` is set, restrict to comments in the 90-day window.
  // Use a bound parameter (never string-interpolated) — fallback to epoch when since is null.
  const sinceDate = since ?? '1970-01-01T00:00:00.000Z';
  const commentRes = await db.prepare(`
    SELECT
      pc.id,
      pc.pr_id,
      pc.login,
      pc.created_at,
      pc.pr_created_at,
      COUNT(cr.id)                                                 AS total_reactions,
      SUM(CASE WHEN cr.is_positive = 1 THEN 1 ELSE 0 END)         AS positive_reactions,
      SUM(CASE WHEN cr.is_positive = 0 THEN 1 ELSE 0 END)         AS negative_reactions
    FROM pr_comments pc
    LEFT JOIN comment_reactions cr ON cr.comment_id = pc.id
    WHERE pc.created_at >= ?
    GROUP BY pc.id
    ORDER BY pc.pr_id, pc.created_at ASC
  `).bind(sinceDate).all<CommentRow>();

  const comments = commentRes.results;

  // Group comments by pr_id
  const byPR = new Map<number, CommentRow[]>();
  for (const c of comments) {
    if (!byPR.has(c.pr_id)) byPR.set(c.pr_id, []);
    byPR.get(c.pr_id)!.push(c);
  }

  const now = Date.now();

  for (const [, prComments] of byPR.entries()) {
    if (prComments.length === 0) continue;

    // PR age check for early_mover_bonus: only applies if PR is >72h old
    const prCreatedMs = new Date(prComments[0].pr_created_at).getTime();
    const prAgeHours  = (now - prCreatedMs) / 3_600_000;
    const applyEarlyMover = prAgeHours > 72;

    const N = prComments.length;

    // Early-mover bucket boundaries (rank is 1-indexed)
    const bucket1End = Math.max(1, Math.floor(N * 0.01));
    const bucket2End = bucket1End + Math.floor(N * 0.09);
    const bucket3End = bucket2End + Math.floor(N * 0.15);

    // Influencer: find top comment IDs for total / positive / negative reactions
    let maxTotal = -1, maxPositive = -1, maxNegative = -1;
    let topTotalId = -1, topPositiveId = -1, topNegativeId = -1;

    for (const c of prComments) {
      // total_reactions / positive_reactions / negative_reactions may be null from LEFT JOIN
      const total    = c.total_reactions    ?? 0;
      const positive = c.positive_reactions ?? 0;
      const negative = c.negative_reactions ?? 0;

      if (total    > maxTotal)    { maxTotal    = total;    topTotalId    = c.id; }
      if (positive > maxPositive) { maxPositive = positive; topPositiveId = c.id; }
      if (negative > maxNegative) { maxNegative = negative; topNegativeId = c.id; }
    }

    // Assign bonuses per comment (prComments is already sorted by created_at ASC)
    for (let rank = 1; rank <= prComments.length; rank++) {
      const c   = prComments[rank - 1];
      const acc = getBonus(c.login);

      // Early-mover bonus
      if (applyEarlyMover) {
        if (rank <= bucket1End)       acc.early_mover += 0.20;
        else if (rank <= bucket2End)  acc.early_mover += 0.10;
        else if (rank <= bucket3End)  acc.early_mover += 0.05;
      }

      // Early-bird bonus (based on hours between PR creation and comment creation)
      const commentMs = new Date(c.created_at).getTime();
      const hoursAfterPR = (commentMs - prCreatedMs) / 3_600_000;
      if (hoursAfterPR <= 24)      acc.early_bird += 0.25;
      else if (hoursAfterPR <= 96) acc.early_bird += 0.10;

      // Influencer bonus (only awarded if at least 1 reaction in the category)
      if (c.id === topTotalId    && maxTotal    > 0) acc.influencer += 0.10;
      if (c.id === topPositiveId && maxPositive > 0) acc.influencer += 0.20;
      if (c.id === topNegativeId && maxNegative > 0) acc.influencer -= 0.50;
    }
  }

  return bonusMap;
}

/**
 * Computes base score components (comment, peer, reaction, trust) for all contributors.
 *
 * @param db - D1 database handle
 * @param since - Optional ISO-8601 cutoff for 90-day computation; null = all-time
 */
async function computeBaseScores(
  db: D1Database,
  since: string | null,
): Promise<Map<string, ScoreRow>> {
  // Use bound parameters for all date filters — never string-interpolated.
  // Fallback to epoch when since is null (effectively no date restriction).
  const sinceDate = since ?? '1970-01-01T00:00:00.000Z';

  // Step 1: comment_score — one point per OASIS comment posted
  const commentScoreRes = await db.prepare(`
    SELECT login, COUNT(*) AS comment_score
    FROM pr_comments pc
    WHERE pc.created_at >= ?
    GROUP BY login
  `).bind(sinceDate).all<{ login: string; comment_score: number }>();

  // Step 2: peer_score — sum of peer_agreement values from reactions received
  // peer_agreement = 0.25 (base) + 0.10 (positive) or -0.50 (negative)
  const peerScoreRes = await db.prepare(`
    SELECT pc.login,
      SUM(
        0.25 +
        CASE
          WHEN cr.is_positive = 1 THEN 0.10
          ELSE -0.50
        END
      ) AS peer_score
    FROM comment_reactions cr
    JOIN pr_comments pc ON cr.comment_id = pc.id
    WHERE pc.created_at >= ?
    GROUP BY pc.login
  `).bind(sinceDate).all<{ login: string; peer_score: number }>();

  // Step 3: reaction_score — reactions GIVEN, capped at 5
  // Joins to pr_comments to enforce the since filter on the comment's date
  const reactionScoreRes = await db.prepare(`
    SELECT cr.reactor AS login,
      MIN(COUNT(*), 5) * 0.25 AS reaction_score
    FROM comment_reactions cr
    JOIN pr_comments pc2 ON cr.comment_id = pc2.id
    WHERE cr.reactor != pc2.login AND pc2.created_at >= ?
    GROUP BY cr.reactor
  `).bind(sinceDate).all<{ login: string; reaction_score: number }>();

  // Step 4: trust_score — 10 × PRs accepted that were merged upstream
  const trustScoreRes = await db.prepare(`
    SELECT ppart.login,
      COUNT(*) * 10 AS trust_score
    FROM pr_participants ppart
    JOIN pull_requests pr ON ppart.pr_id = pr.id
    JOIN pr_comments pc3 ON pc3.pr_id = pr.id AND pc3.login = ppart.login
    WHERE ppart.decision = 'accept' AND pr.merged_upstream = 1 AND pc3.created_at >= ?
    GROUP BY ppart.login
  `).bind(sinceDate).all<{ login: string; trust_score: number }>();

  // Merge all four score maps keyed by login
  const scores = new Map<string, ScoreRow>();
  const get = (login: string): ScoreRow => {
    if (!scores.has(login)) scores.set(login, { login, comment_score: 0, peer_score: 0, reaction_score: 0, trust_score: 0 });
    return scores.get(login)!;
  };

  for (const r of commentScoreRes.results)  get(r.login).comment_score  = r.comment_score  ?? 0;
  for (const r of peerScoreRes.results)     get(r.login).peer_score     = r.peer_score     ?? 0;
  for (const r of reactionScoreRes.results) get(r.login).reaction_score = r.reaction_score ?? 0;
  for (const r of trustScoreRes.results)    get(r.login).trust_score    = r.trust_score    ?? 0;

  return scores;
}

/**
 * Rebuilds all contributor score columns from scratch.
 *
 * Called after every sync (both cron and manual chunked) once all PRs have been processed.
 * Computes all-time scores and 90-day scores, assigns 90-day ranks, and writes everything
 * back to the contributors table in a single pass.
 *
 * See file-level JSDoc for the full formula specification.
 */
export async function rebuildContributors(db: D1Database, syncStart: string): Promise<void> {
  const now90d = new Date(Date.now() - 90 * 24 * 3_600_000).toISOString();

  // ── All-time computation ─────────────────────────────────────
  const allTimeBase   = await computeBaseScores(db, null);
  const allTimeBonuses = await computeBonuses(db, null);

  // ── 90-day computation ───────────────────────────────────────
  const d90Base    = await computeBaseScores(db, now90d);
  const d90Bonuses = await computeBonuses(db, now90d);

  // Collect all logins from both windows
  const allLogins = new Set<string>([
    ...allTimeBase.keys(),
    ...d90Base.keys(),
  ]);

  // ── Compute modified_reputation per login ────────────────────
  interface ReputationEntry {
    login: string;
    comment_score: number;
    peer_score: number;
    reaction_score: number;
    trust_score: number;
    base_reputation: number;
    modified_reputation: number;
    d90_modified: number;      // used for rank_90d; not stored directly
    d90_oldest_activity: string | null;
  }

  const entries: ReputationEntry[] = [];

  for (const login of allLogins) {
    const at  = allTimeBase.get(login)  ?? { login, comment_score: 0, peer_score: 0, reaction_score: 0, trust_score: 0 };
    const atB = allTimeBonuses.get(login) ?? { early_mover: 0, early_bird: 0, influencer: 0 };

    const base = at.comment_score + at.peer_score + at.reaction_score + at.trust_score;
    const totalBonus = atB.early_mover + atB.early_bird + atB.influencer;
    const modified = base * (1 + totalBonus);

    const d90  = d90Base.get(login)    ?? { login, comment_score: 0, peer_score: 0, reaction_score: 0, trust_score: 0 };
    const d90B = d90Bonuses.get(login) ?? { early_mover: 0, early_bird: 0, influencer: 0 };
    const d90Base_ = d90.comment_score + d90.peer_score + d90.reaction_score + d90.trust_score;
    const d90TotalBonus = d90B.early_mover + d90B.early_bird + d90B.influencer;
    const d90Modified = d90Base_ * (1 + d90TotalBonus);

    entries.push({
      login,
      comment_score: at.comment_score,
      peer_score: at.peer_score,
      reaction_score: at.reaction_score,
      trust_score: at.trust_score,
      base_reputation: base,
      modified_reputation: modified,
      d90_modified: d90Modified,
      d90_oldest_activity: null, // filled below
    });
  }

  // ── Compute rank_90d ─────────────────────────────────────────
  // Sort by 90-day modified_reputation DESC; only entries with d90_modified > 0 get a rank
  const ranked = entries
    .filter(e => e.d90_modified > 0)
    .sort((a, b) => b.d90_modified - a.d90_modified);

  const rankMap = new Map<string, number>();
  for (let i = 0; i < ranked.length; i++) {
    rankMap.set(ranked[i].login, i + 1);
  }

  // ── Compute rank_90d_oldest_activity ─────────────────────────
  // For each login that has 90-day activity, find their oldest comment in the window
  if (ranked.length > 0) {
    const oldestRes = await db.prepare(`
      SELECT login, MIN(created_at) AS oldest
      FROM pr_comments
      WHERE created_at >= ?
      GROUP BY login
    `).bind(now90d).all<{ login: string; oldest: string }>();

    for (const row of oldestRes.results) {
      const entry = entries.find(e => e.login === row.login);
      if (entry) entry.d90_oldest_activity = row.oldest;
    }
  }

  // ── Write reactions_given back from participantMap aggregation ─
  // We need reactions_given aggregated from pr_participants; however that field
  // is tracked via the participantMap in sync. We aggregate it from comment_reactions.
  const reactionsGivenRes = await db.prepare(`
    SELECT cr.reactor AS login, COUNT(*) AS reactions_given
    FROM comment_reactions cr
    JOIN pr_comments pc ON cr.comment_id = pc.id
    WHERE cr.reactor != pc.login
    GROUP BY cr.reactor
  `).all<{ login: string; reactions_given: number }>();

  const reactionsGivenMap = new Map<string, number>();
  for (const r of reactionsGivenRes.results) {
    reactionsGivenMap.set(r.login, r.reactions_given ?? 0);
  }

  // ── Write back to contributors table ─────────────────────────
  for (const entry of entries) {
    const existing = await db.prepare('SELECT avatar_url, prs_worked, total_interactions, non_oasis_interactions, reactions_received, accepts, modifies, rejects, duplicates FROM contributors WHERE login = ?')
      .bind(entry.login).first<{
        avatar_url: string | null;
        prs_worked: number;
        total_interactions: number;
        non_oasis_interactions: number;
        reactions_received: number;
        accepts: number;
        modifies: number;
        rejects: number;
        duplicates: number;
      }>();

    // Aggregate prs_worked, interactions, accepts etc. from pr_participants
    const partRow = await db.prepare(`
      SELECT
        COUNT(DISTINCT pr_id)                                        AS prs_worked,
        SUM(interactions)                                            AS total_interactions,
        SUM(COALESCE(non_oasis_interactions, 0))                     AS non_oasis_interactions,
        SUM(reactions_received)                                      AS reactions_received,
        SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END)        AS accepts,
        SUM(CASE WHEN decision = 'modify' THEN 1 ELSE 0 END)        AS modifies,
        SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END)        AS rejects,
        SUM(CASE WHEN decision = 'duplicate' THEN 1 ELSE 0 END)     AS duplicates
      FROM pr_participants WHERE login = ?
    `).bind(entry.login).first<{
      prs_worked: number;
      total_interactions: number;
      non_oasis_interactions: number;
      reactions_received: number;
      accepts: number;
      modifies: number;
      rejects: number;
      duplicates: number;
    }>();

    const rank90d = rankMap.get(entry.login) ?? null;

    await db.prepare(`
      INSERT OR REPLACE INTO contributors
        (login, avatar_url,
         prs_worked, total_interactions, non_oasis_interactions,
         reactions_received, reactions_given,
         accepts, modifies, rejects, duplicates,
         comment_score, peer_score, reaction_score, trust_score,
         base_reputation, modified_reputation,
         rank_90d, rank_90d_oldest_activity,
         synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      entry.login,
      existing?.avatar_url ?? `https://github.com/${entry.login}.png?size=64`,
      partRow?.prs_worked             ?? 0,
      partRow?.total_interactions     ?? 0,
      partRow?.non_oasis_interactions ?? 0,
      partRow?.reactions_received     ?? 0,
      reactionsGivenMap.get(entry.login) ?? 0,
      partRow?.accepts ?? 0,
      partRow?.modifies ?? 0,
      partRow?.rejects  ?? 0,
      partRow?.duplicates ?? 0,
      Math.round(entry.comment_score  * 100) / 100,
      Math.round(entry.peer_score     * 100) / 100,
      Math.round(entry.reaction_score * 100) / 100,
      Math.round(entry.trust_score    * 100) / 100,
      Math.round(entry.base_reputation     * 100) / 100,
      Math.round(entry.modified_reputation * 100) / 100,
      rank90d,
      entry.d90_oldest_activity ?? null,
      syncStart,
    ).run();
  }
}
