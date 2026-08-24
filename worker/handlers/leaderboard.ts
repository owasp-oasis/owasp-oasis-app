/**
 * Leaderboard API handlers: meta, repos, PRs, contributors, maintainers, tools.
 */

import type { Env, ParsedQuery } from '../types.js';
import { secHeaders } from '../security.js';
import { BOT_TO_TOOL, BOT_TO_VALIDATOR_TOOL } from '../github.js';

/* ─── QUERY HELPER ───────────────────────────────────────────── */
export function parseQuery(url: URL): ParsedQuery {
  const sort = url.searchParams.get('sort') ?? '';
  const dir  = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const q    = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  return { sort, dir, q };
}

// Leaderboard responses: security headers + public cache for 5 minutes
function lbResponse(data: unknown, req: Request, status = 200): Response {
  const res = new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  const r = secHeaders(res, req);
  r.headers.set('Cache-Control', 'public, max-age=300');
  return r;
}

/* ─── HANDLERS ───────────────────────────────────────────────── */
export async function handleMeta(env: Env, req: Request): Promise<Response> {
  const row     = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'last_synced_at'")
    .first<{ value: string }>();
  const running = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'sync_running'")
    .first<{ value: string }>();
  return lbResponse(
    { last_synced_at: row?.value ?? null, sync_running: running?.value === '1' },
    req,
  );
}

export async function handleRepos(env: Env, req: Request, url: URL): Promise<Response> {
  const { sort, dir, q } = parseQuery(url);
  const VALID = new Set(['name', 'language', 'open_prs', 'duplicate_count', 'stars']);
  const col   = VALID.has(sort) ? sort : 'open_prs';
  const rows  = await env.DB.prepare(`
    SELECT r.id, r.name, r.full_name, r.description, r.language,
           r.open_prs, r.duplicate_count, r.stars, r.upstream_url, r.synced_at,
           (SELECT COUNT(*) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_prs,
           (SELECT COUNT(DISTINCT pp.login)
              FROM pr_participants pp JOIN pull_requests participant_pr ON participant_pr.id = pp.pr_id
             WHERE participant_pr.repo_id = r.id AND pp.decision IS NOT NULL) AS contributors,
           (SELECT COALESCE(SUM(p.consensus_accept), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_accept,
           (SELECT COALESCE(SUM(p.consensus_modify), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_modify,
           (SELECT COALESCE(SUM(p.consensus_reject), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_reject,
           (SELECT COALESCE(SUM(p.consensus_duplicate), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_duplicate
    FROM repos r
    WHERE r.active = 1 AND EXISTS (
      SELECT 1 FROM pull_requests current_pr
      WHERE current_pr.repo_id = r.id AND current_pr.deleted = 0
    )
    ORDER BY ${col} ${dir}
  `).all();
  let results = rows.results;
  if (q) results = results.filter((r: Record<string, unknown>) =>
    String(r['name'] ?? '').toLowerCase().includes(q) ||
    String(r['language'] ?? '').toLowerCase().includes(q) ||
    String(r['description'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}

/**
 * GET /api/leaderboard/repos/:id
 * Returns detailed project info for the ProjectPanel slide-out:
 *   - repo row (full metadata)
 *   - all PRs for the repo
 *   - top 20 contributors by comment count
 */
export async function handleRepoDetail(env: Env, req: Request, repoId: number): Promise<Response> {
  // Parallelize Q1 (repo) and Q2 (PRs)
  const [repoRow, prsRows] = await Promise.all([
    env.DB.prepare(`
      SELECT id, name, full_name, description, language,
             open_prs, duplicate_count, stars, upstream_url, synced_at,
             (SELECT COUNT(*) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_prs,
             (SELECT COUNT(DISTINCT pp.login)
                FROM pr_participants pp JOIN pull_requests participant_pr ON participant_pr.id = pp.pr_id
               WHERE participant_pr.repo_id = r.id AND pp.decision IS NOT NULL) AS contributors,
             (SELECT COALESCE(SUM(p.consensus_accept), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_accept,
             (SELECT COALESCE(SUM(p.consensus_modify), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_modify,
             (SELECT COALESCE(SUM(p.consensus_reject), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_reject,
             (SELECT COALESCE(SUM(p.consensus_duplicate), 0) FROM pull_requests p WHERE p.repo_id = r.id AND p.deleted = 0) AS total_duplicate
      FROM repos r WHERE r.id = ? AND r.active = 1
    `).bind(repoId).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id, number, title, state, author, html_url,
             comment_count, oasis_comment_count, non_oasis_comment_count,
             participants, consensus_accept, consensus_modify, consensus_reject,
             merged_upstream, updated_at
      FROM pull_requests WHERE repo_id = ? AND deleted = 0
      ORDER BY updated_at DESC
    `).bind(repoId).all<Record<string, unknown>>(),
  ]);

  if (!repoRow) {
    return new Response(JSON.stringify({ ok: false, error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Q3: Top contributors for this repo
  const contributorsRows = await env.DB.prepare(`
    SELECT p.login, c.avatar_url,
           COUNT(*) AS comment_count,
           SUM(CASE WHEN p.decision='accept' THEN 1 ELSE 0 END) AS accepts,
           SUM(CASE WHEN p.decision='modify' THEN 1 ELSE 0 END) AS modifies,
           SUM(CASE WHEN p.decision='reject' THEN 1 ELSE 0 END) AS rejects
    FROM pr_comments p
    JOIN pull_requests pr ON pr.id = p.pr_id
    LEFT JOIN contributors c ON c.login = p.login
    WHERE pr.repo_id = ?
    GROUP BY p.login
    ORDER BY comment_count DESC
    LIMIT 20
  `).bind(repoId).all<Record<string, unknown>>();

  return lbResponse({
    ok: true,
    repo: repoRow,
    prs: prsRows.results,
    top_contributors: contributorsRows.results,
  }, req);
}

export async function handlePRs(env: Env, req: Request, url: URL): Promise<Response> {
  const { sort, dir, q } = parseQuery(url);
  const VALID = new Set(['repo_name','number','title','state','comment_count',
    'oasis_comment_count','non_oasis_comment_count','participants',
    'consensus_accept','consensus_modify','consensus_reject','consensus_duplicate','updated_at']);
  const col = VALID.has(sort) ? sort : 'updated_at';
  const rows = await env.DB.prepare(`
    SELECT p.id, p.repo_id, p.repo_name, p.number, p.title, p.state, p.author, p.html_url,
           comment_count,
           COALESCE(oasis_comment_count, 0)     AS oasis_comment_count,
           COALESCE(non_oasis_comment_count, 0)  AS non_oasis_comment_count,
           participants,
           consensus_accept, consensus_modify, consensus_reject, consensus_duplicate,
           duplicate_of, closed_as_duplicate,
           merged_upstream, merged_at, created_at, updated_at
    FROM pull_requests p JOIN repos r ON r.id = p.repo_id
    WHERE p.deleted = 0 AND r.active = 1
    ORDER BY ${col} ${dir} LIMIT 500
  `).all();
  let results = rows.results;
  if (q) results = results.filter((r: Record<string, unknown>) =>
    String(r['repo_name'] ?? '').toLowerCase().includes(q) ||
    String(r['title'] ?? '').toLowerCase().includes(q) ||
    String(r['author'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}

export async function handleContributors(env: Env, req: Request, url: URL): Promise<Response> {
  const { sort, dir, q } = parseQuery(url);
  const VALID = new Set([
    'login', 'prs_worked', 'total_interactions', 'non_oasis_interactions',
    'reactions_received', 'reactions_given',
    'accepts', 'modifies', 'rejects', 'duplicates',
    'base_reputation', 'modified_reputation', 'rank_90d',
    'avg_per_pr',
  ]);
  const col = VALID.has(sort) ? sort : 'modified_reputation';
  const rows = await env.DB.prepare(`
    SELECT
      c.login, c.avatar_url, c.prs_worked, c.total_interactions,
      COALESCE(c.non_oasis_interactions, 0) AS non_oasis_interactions,
      COALESCE(c.reactions_received, 0)     AS reactions_received,
      COALESCE(c.reactions_given, 0)        AS reactions_given,
      c.accepts, c.modifies, c.rejects, COALESCE(c.duplicates, 0) AS duplicates,
      COALESCE(c.base_reputation, 0)        AS base_reputation,
      COALESCE(c.modified_reputation, 0)    AS modified_reputation,
      c.rank_90d,
      c.rank_90d_oldest_activity,
      CASE WHEN c.prs_worked > 0
        THEN ROUND(CAST(c.total_interactions AS REAL) / c.prs_worked, 2)
        ELSE 0 END AS avg_per_pr
    FROM contributors c
    ORDER BY ${col} ${dir}
  `).all();
  let results = rows.results;
  if (q) results = results.filter((r: Record<string, unknown>) =>
    String(r['login'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}

/**
 * GET /api/contributors/:login
 * Returns full contributor detail for the slide-out ContributorPanel:
 *   - contributor row (all score columns)
 *   - all-time rank
 *   - contributions list (all OASIS comments with per-comment scores and bonuses)
 */
export async function handleContributorDetail(env: Env, req: Request, login: string): Promise<Response> {
  // Parallelise Q1 (contributor row) and Q2 (all-time rank)
  const [contributor, rankRow] = await Promise.all([
    env.DB.prepare(`
      SELECT
        login, avatar_url, prs_worked, total_interactions,
        COALESCE(non_oasis_interactions, 0) AS non_oasis_interactions,
        COALESCE(reactions_received, 0)     AS reactions_received,
        COALESCE(reactions_given, 0)        AS reactions_given,
        accepts, modifies, rejects, COALESCE(duplicates, 0) AS duplicates,
        COALESCE(comment_score, 0)          AS comment_score,
        COALESCE(peer_score, 0)             AS peer_score,
        COALESCE(reaction_score, 0)         AS reaction_score,
        COALESCE(trust_score, 0)            AS trust_score,
        COALESCE(base_reputation, 0)        AS base_reputation,
        COALESCE(modified_reputation, 0)    AS modified_reputation,
        rank_90d,
        rank_90d_oldest_activity,
        synced_at
      FROM contributors WHERE login = ?
    `).bind(login).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM contributors
      WHERE modified_reputation > (SELECT modified_reputation FROM contributors WHERE login = ?)
    `).bind(login).first<{ rank: number }>(),
  ]);

  if (!contributor) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const allTimeRank = rankRow?.rank ?? 1;

  // Fetch all comments for this contributor + all comments on their PRs
  // Single query: all pr_comments for any PR the contributor touched
  // Left join reactions to get per-comment reaction counts
  const allCommentData = await env.DB.prepare(`
    SELECT
      pc.id            AS comment_id,
      pc.pr_id,
      pc.pr_number,
      pc.repo_name,
      pc.login         AS comment_login,
      pc.decision,
      pc.created_at    AS commented_at,
      pc.pr_created_at,
      pr.title         AS pr_title,
      pr.html_url      AS pr_url,
      pr.merged_upstream,
      COALESCE(COUNT(CASE WHEN cr.id IS NOT NULL THEN 1 END), 0) AS total_reactions,
      COALESCE(SUM(CASE WHEN cr.is_positive = 1 THEN 1 ELSE 0 END), 0) AS positive_reactions,
      COALESCE(SUM(CASE WHEN cr.is_positive = 0 THEN 1 ELSE 0 END), 0) AS negative_reactions
    FROM pr_comments pc
    JOIN pull_requests pr ON pr.id = pc.pr_id
    LEFT JOIN comment_reactions cr ON cr.comment_id = pc.id
    WHERE pc.pr_id IN (
      SELECT DISTINCT pr_id FROM pr_comments WHERE login = ?
    )
    GROUP BY pc.id, pc.pr_id, pc.pr_number, pc.repo_name, pc.login, pc.decision, 
             pc.created_at, pc.pr_created_at, pr.title, pr.html_url, pr.merged_upstream
    ORDER BY pc.pr_id, pc.created_at ASC
  `).bind(login).all<{
    comment_id: number;
    pr_id: number;
    pr_number: number;
    repo_name: string;
    comment_login: string;
    decision: 'accept' | 'modify' | 'reject' | null;
    commented_at: string;
    pr_created_at: string;
    pr_title: string;
    pr_url: string;
    merged_upstream: number;
    total_reactions: number;
    positive_reactions: number;
    negative_reactions: number;
  }>();

  // Group all comments by PR for bonus calculation
  const prCommentsByPR = new Map<number, Array<{
    id: number; login: string; created_at: string; pr_created_at: string;
    total_reactions: number; positive_reactions: number; negative_reactions: number;
  }>>();

  for (const row of allCommentData.results) {
    const prId = row.pr_id;
    if (!prCommentsByPR.has(prId)) {
      prCommentsByPR.set(prId, []);
    }
    prCommentsByPR.get(prId)!.push({
      id: row.comment_id,
      login: row.comment_login,
      created_at: row.commented_at,
      pr_created_at: row.pr_created_at,
      total_reactions: row.total_reactions,
      positive_reactions: row.positive_reactions,
      negative_reactions: row.negative_reactions,
    });
  }

  // Build bonus map per comment_id
  const commentBonuses = new Map<number, { early_mover: number; early_bird: number; influencer: number }>();
  const now = Date.now();

  for (const [, prComments] of prCommentsByPR.entries()) {
    if (prComments.length === 0) continue;
    const prCreatedMs = new Date(prComments[0].pr_created_at).getTime();
    const prAgeHours  = (now - prCreatedMs) / 3_600_000;
    const applyEarlyMover = prAgeHours > 72;
    const N = prComments.length;
    const bucket1End = Math.max(1, Math.floor(N * 0.01));
    const bucket2End = bucket1End + Math.floor(N * 0.09);
    const bucket3End = bucket2End + Math.floor(N * 0.15);

    let maxTotal = -1, maxPositive = -1, maxNegative = -1;
    let topTotalId = -1, topPositiveId = -1, topNegativeId = -1;
    for (const c of prComments) {
      if ((c.total_reactions    ?? 0) > maxTotal)    { maxTotal    = c.total_reactions;    topTotalId    = c.id; }
      if ((c.positive_reactions ?? 0) > maxPositive) { maxPositive = c.positive_reactions; topPositiveId = c.id; }
      if ((c.negative_reactions ?? 0) > maxNegative) { maxNegative = c.negative_reactions; topNegativeId = c.id; }
    }

    for (let rank = 1; rank <= prComments.length; rank++) {
      const c = prComments[rank - 1];
      const bonus = { early_mover: 0, early_bird: 0, influencer: 0 };
      commentBonuses.set(c.id, bonus);

      if (applyEarlyMover) {
        if (rank <= bucket1End)       bonus.early_mover = 0.20;
        else if (rank <= bucket2End)  bonus.early_mover = 0.10;
        else if (rank <= bucket3End)  bonus.early_mover = 0.05;
      }
      const hoursAfterPR = (new Date(c.created_at).getTime() - prCreatedMs) / 3_600_000;
      if (hoursAfterPR <= 24)      bonus.early_bird = 0.25;
      else if (hoursAfterPR <= 96) bonus.early_bird = 0.10;

      if (c.id === topTotalId    && maxTotal    > 0) bonus.influencer += 0.10;
      if (c.id === topPositiveId && maxPositive > 0) bonus.influencer += 0.20;
      if (c.id === topNegativeId && maxNegative > 0) bonus.influencer -= 0.50;
    }
  }

  // Build contributions list from all comment data, filtering to only this contributor's comments
  const contributions = allCommentData.results
    .filter(row => row.comment_login === login)
    .map(row => {
      const bonus = commentBonuses.get(row.comment_id) ?? { early_mover: 0, early_bird: 0, influencer: 0 };
      return {
        comment_id: row.comment_id,
        pr_id: row.pr_id,
        pr_number: row.pr_number,
        repo_name: row.repo_name,
        decision: row.decision,
        commented_at: row.commented_at,
        pr_created_at: row.pr_created_at,
        pr_title: row.pr_title,
        pr_url: row.pr_url,
        merged_upstream: row.merged_upstream,
        peer_score_earned: 0, // Will be calculated by front-end or kept at 0 if not needed
        total_reactions: row.total_reactions,
        positive_reactions: row.positive_reactions,
        negative_reactions: row.negative_reactions,
        early_mover_bonus: Math.round(bonus.early_mover * 1000) / 1000,
        early_bird_bonus:  Math.round(bonus.early_bird  * 1000) / 1000,
        influencer_bonus:  Math.round(bonus.influencer  * 1000) / 1000,
      };
    });

  return lbResponse({ contributor, allTimeRank, contributions }, req);
}

export async function handleMaintainers(env: Env, req: Request, url: URL): Promise<Response> {
  const { sort, dir, q } = parseQuery(url);
  const VALID = new Set(['repo_name','total_submitted','total_merged','merge_rate']);
  const col = VALID.has(sort) ? sort : 'merge_rate';
  const rows = await env.DB.prepare(`
    SELECT p.repo_name, r.upstream_url,
           COUNT(*)                                                         AS total_submitted,
           SUM(p.merged_upstream)                                           AS total_merged,
           CASE WHEN COUNT(*) > 0
             THEN ROUND(CAST(SUM(p.merged_upstream) AS REAL) / COUNT(*) * 100, 1)
             ELSE 0 END AS merge_rate,
           SUM(p.consensus_accept) AS total_accept_consensus
    FROM pull_requests p JOIN repos r ON r.id = p.repo_id
    WHERE p.deleted = 0 AND r.active = 1
    GROUP BY r.id, p.repo_name ORDER BY ${col} ${dir}
  `).all();
  let results = rows.results;
  if (q) results = results.filter((r: Record<string, unknown>) =>
    String(r['repo_name'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}

export async function handleTools(env: Env, req: Request, url: URL): Promise<Response> {
  const { q } = parseQuery(url);

  // ── Fix tools: bot accounts that author PRs ───────────────────
  const fixRows = await env.DB.prepare(`
    SELECT author, COUNT(*) AS total_prs, SUM(merged_upstream) AS accepted_upstream,
           COUNT(DISTINCT repo_id) AS projects_worked,
           SUM(COALESCE(oasis_comment_count, 0)) AS total_comments,
           SUM(consensus_accept) AS total_accept, SUM(consensus_modify) AS total_modify,
           SUM(consensus_reject) AS total_reject
    FROM pull_requests WHERE author IS NOT NULL AND deleted = 0 GROUP BY author ORDER BY total_prs DESC
  `).all<{
    author: string;
    total_prs: number;
    accepted_upstream: number | null;
    projects_worked: number | null;
    total_comments: number | null;
    total_accept: number | null;
    total_modify: number | null;
    total_reject: number | null;
  }>();

  const fixToolMap = new Map<string, {
    login: string; name: string; total_prs: number;
    accepted_upstream: number; projects_worked: number; interactions: number;
    total_accept: number; total_modify: number; total_reject: number;
  }>();

  for (const r of fixRows.results) {
    const toolName = BOT_TO_TOOL[r.author];
    if (!toolName) continue;
    const existing = fixToolMap.get(toolName);
    if (existing) {
      existing.total_prs         += r.total_prs;
      existing.accepted_upstream += r.accepted_upstream ?? 0;
      existing.projects_worked   += r.projects_worked ?? 0;
      existing.interactions      += r.total_comments ?? 0;
      existing.total_accept      += r.total_accept ?? 0;
      existing.total_modify      += r.total_modify ?? 0;
      existing.total_reject      += r.total_reject ?? 0;
    } else {
      fixToolMap.set(toolName, {
        login: r.author, name: toolName, total_prs: r.total_prs,
        accepted_upstream: r.accepted_upstream ?? 0, projects_worked: r.projects_worked ?? 0,
        interactions: r.total_comments ?? 0, total_accept: r.total_accept ?? 0,
        total_modify: r.total_modify ?? 0, total_reject: r.total_reject ?? 0,
      });
    }
  }

  // ── Detect tools: named by "Detected By" field in PR bodies ──
  const detectRows = await env.DB.prepare(`
    SELECT detection_tool, COUNT(*) AS vulnerabilities, COUNT(DISTINCT repo_id) AS projects_worked,
           SUM(merged_upstream) AS accepted_upstream,
           SUM(consensus_accept) AS total_accept, SUM(consensus_modify) AS total_modify,
           SUM(consensus_reject) AS total_reject
    FROM pull_requests WHERE detection_tool IS NOT NULL AND deleted = 0 GROUP BY detection_tool ORDER BY vulnerabilities DESC
  `).all<{
    detection_tool: string;
    vulnerabilities: number;
    projects_worked: number;
    accepted_upstream: number | null;
    total_accept: number | null;
    total_modify: number | null;
    total_reject: number | null;
  }>();

  // ── Validate tools: bots that post OASIS-template validation comments ──
  // Known validator bot logins (from BOT_TO_VALIDATOR_TOOL).
  const validatorBotLogins = Object.keys(BOT_TO_VALIDATOR_TOOL);

  const validateBotMap = new Map<string, {
    login: string; name: string; interactions: number;
    projects_worked: number; total_accept: number; total_modify: number; total_reject: number;
  }>();

  if (validatorBotLogins.length > 0) {
    // Query pr_comments for each known validator bot login
    for (const botLogin of validatorBotLogins) {
      const toolName = BOT_TO_VALIDATOR_TOOL[botLogin];
      const botRows = await env.DB.prepare(`
        SELECT
          COUNT(*)                                                         AS total_comments,
          COUNT(DISTINCT pr.repo_id)                                       AS projects_worked,
          SUM(CASE WHEN pc.decision = 'accept' THEN 1 ELSE 0 END)         AS total_accept,
          SUM(CASE WHEN pc.decision = 'modify' THEN 1 ELSE 0 END)         AS total_modify,
          SUM(CASE WHEN pc.decision = 'reject' THEN 1 ELSE 0 END)         AS total_reject
        FROM pr_comments pc JOIN pull_requests pr ON pr.id = pc.pr_id
        WHERE pc.login = ?
      `).bind(botLogin).first<{
        total_comments: number;
        projects_worked: number;
        total_accept: number | null;
        total_modify: number | null;
        total_reject: number | null;
      }>();

      if (!botRows || botRows.total_comments === 0) continue;

      const existing = validateBotMap.get(toolName);
      if (existing) {
        existing.interactions      += botRows.total_comments;
        existing.projects_worked   += botRows.projects_worked;
        existing.total_accept      += botRows.total_accept ?? 0;
        existing.total_modify      += botRows.total_modify ?? 0;
        existing.total_reject      += botRows.total_reject ?? 0;
      } else {
        validateBotMap.set(toolName, {
          login: botLogin, name: toolName,
          interactions:    botRows.total_comments,
          projects_worked: botRows.projects_worked,
          total_accept:    botRows.total_accept  ?? 0,
          total_modify:    botRows.total_modify  ?? 0,
          total_reject:    botRows.total_reject  ?? 0,
        });
      }
    }
  }

  // ── Human validators aggregate ────────────────────────────────
  // All OASIS-template comments posted by non-bot humans.
  // Exclude any known validator bot logins.
  const allBotLogins = [...new Set([...Object.keys(BOT_TO_TOOL), ...validatorBotLogins])];
  const botPlaceholders = allBotLogins.map(() => '?').join(', ');
  const humanQuery = allBotLogins.length > 0
    ? `SELECT
         COUNT(*)                                              AS total_comments,
         COUNT(DISTINCT pc.login)                              AS validator_count,
         COUNT(DISTINCT pr.repo_id)                            AS projects_worked,
         SUM(CASE WHEN pc.decision = 'accept' THEN 1 ELSE 0 END) AS total_accept,
         SUM(CASE WHEN pc.decision = 'modify' THEN 1 ELSE 0 END) AS total_modify,
         SUM(CASE WHEN pc.decision = 'reject' THEN 1 ELSE 0 END) AS total_reject
       FROM pr_comments pc JOIN pull_requests pr ON pr.id = pc.pr_id
       WHERE pc.login NOT IN (${botPlaceholders})`
    : `SELECT
         COUNT(*)                                              AS total_comments,
         COUNT(DISTINCT pc.login)                              AS validator_count,
         COUNT(DISTINCT pr.repo_id)                            AS projects_worked,
         SUM(CASE WHEN pc.decision = 'accept' THEN 1 ELSE 0 END) AS total_accept,
         SUM(CASE WHEN pc.decision = 'modify' THEN 1 ELSE 0 END) AS total_modify,
         SUM(CASE WHEN pc.decision = 'reject' THEN 1 ELSE 0 END) AS total_reject
       FROM pr_comments pc JOIN pull_requests pr ON pr.id = pc.pr_id`;

  const humanStmt = allBotLogins.length > 0
    ? env.DB.prepare(humanQuery).bind(...allBotLogins)
    : env.DB.prepare(humanQuery);

  const humanRows = await humanStmt.first<{
    total_comments: number;
    validator_count: number;
    projects_worked: number;
    total_accept: number | null;
    total_modify: number | null;
    total_reject: number | null;
  }>();

  // ── Assemble result list (order: detect → fix → validate) ────
  const tools: unknown[] = [];

  // Detect — sorted by vulnerabilities DESC (already from DB query)
  for (const d of detectRows.results) {
    tools.push({
      name: d.detection_tool, role: 'detect', card_key: `detect:${d.detection_tool}`,
      login: null, total_prs: null, vulnerabilities: d.vulnerabilities,
      accepted_upstream: d.accepted_upstream ?? 0, projects_worked: d.projects_worked,
      interactions: null, total_accept: d.total_accept ?? 0,
      total_modify: d.total_modify ?? 0, total_reject: d.total_reject ?? 0,
      validator_count: null,
    });
  }

  // Fix — sorted by total_prs DESC
  const fixList = [...fixToolMap.values()].sort((a, b) => b.total_prs - a.total_prs);
  for (const fix of fixList) {
    tools.push({
      name: fix.name, role: 'fix', card_key: `fix:${fix.name}`, login: fix.login,
      total_prs: fix.total_prs, vulnerabilities: fix.total_prs,
      accepted_upstream: fix.accepted_upstream, projects_worked: fix.projects_worked,
      interactions: fix.interactions, total_accept: fix.total_accept,
      total_modify: fix.total_modify, total_reject: fix.total_reject,
      validator_count: null,
    });
  }

  // Validate — bot validators sorted by interactions DESC, then Human aggregate
  const validateList = [...validateBotMap.values()].sort((a, b) => b.interactions - a.interactions);
  for (const v of validateList) {
    tools.push({
      name: v.name, role: 'validate', card_key: `validate:${v.name}`, login: v.login,
      total_prs: null, vulnerabilities: null,
      accepted_upstream: 0, projects_worked: v.projects_worked,
      interactions: v.interactions, total_accept: v.total_accept,
      total_modify: v.total_modify, total_reject: v.total_reject,
      validator_count: null,
    });
  }

  // Human aggregate card (always last in Validate section; omit if no data)
  if (humanRows && humanRows.total_comments > 0) {
    tools.push({
      name: 'Human Validators', role: 'validate', card_key: 'validate:humans',
      login: null, total_prs: null, vulnerabilities: null,
      accepted_upstream: 0, projects_worked: humanRows.projects_worked,
      interactions: humanRows.total_comments, total_accept: humanRows.total_accept ?? 0,
      total_modify: humanRows.total_modify ?? 0, total_reject: humanRows.total_reject ?? 0,
      validator_count: humanRows.validator_count,
    });
  }

  let results = tools;
  if (q) results = results.filter((r: unknown) =>
    String((r as Record<string, unknown>)['name'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}
