/**
 * Leaderboard API handlers: meta, repos, PRs, contributors, maintainers, tools.
 */

import type { Env, ParsedQuery } from '../types.js';
import { secHeaders } from '../security.js';
import { BOT_TO_TOOL } from '../github.js';

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
  const VALID = new Set(['name', 'language', 'open_prs', 'stars']);
  const col   = VALID.has(sort) ? sort : 'open_prs';
  const rows  = await env.DB.prepare(`
    SELECT r.id, r.name, r.full_name, r.description, r.language,
           r.open_prs, r.stars, r.upstream_url, r.synced_at,
           (SELECT COUNT(*) FROM pull_requests p WHERE p.repo_name = r.name)                             AS total_prs,
           (SELECT COUNT(DISTINCT pp.login) FROM pr_participants pp WHERE pp.repo_name = r.name AND pp.decision IS NOT NULL) AS contributors,
           (SELECT COALESCE(SUM(p.consensus_accept), 0) FROM pull_requests p WHERE p.repo_name = r.name) AS total_accept,
           (SELECT COALESCE(SUM(p.consensus_modify), 0) FROM pull_requests p WHERE p.repo_name = r.name) AS total_modify,
           (SELECT COALESCE(SUM(p.consensus_reject), 0) FROM pull_requests p WHERE p.repo_name = r.name) AS total_reject
    FROM repos r
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

export async function handlePRs(env: Env, req: Request, url: URL): Promise<Response> {
  const { sort, dir, q } = parseQuery(url);
  const VALID = new Set(['repo_name','number','title','state','comment_count',
    'oasis_comment_count','non_oasis_comment_count','participants',
    'consensus_accept','consensus_modify','consensus_reject','updated_at']);
  const col = VALID.has(sort) ? sort : 'updated_at';
  const rows = await env.DB.prepare(`
    SELECT id, repo_name, number, title, state, author, html_url,
           comment_count,
           COALESCE(oasis_comment_count, 0)     AS oasis_comment_count,
           COALESCE(non_oasis_comment_count, 0)  AS non_oasis_comment_count,
           participants,
           consensus_accept, consensus_modify, consensus_reject,
           merged_upstream, merged_at, created_at, updated_at
    FROM pull_requests ORDER BY ${col} ${dir} LIMIT 500
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
    'accepts', 'modifies', 'rejects',
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
      c.accepts, c.modifies, c.rejects,
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
  // Fetch contributor row
  const contributor = await env.DB.prepare(`
    SELECT
      login, avatar_url, prs_worked, total_interactions,
      COALESCE(non_oasis_interactions, 0) AS non_oasis_interactions,
      COALESCE(reactions_received, 0)     AS reactions_received,
      COALESCE(reactions_given, 0)        AS reactions_given,
      accepts, modifies, rejects,
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
  `).bind(login).first<Record<string, unknown>>();

  if (!contributor) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // All-time rank: how many contributors have a higher modified_reputation
  const rankRow = await env.DB.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM contributors
    WHERE modified_reputation > (SELECT modified_reputation FROM contributors WHERE login = ?)
  `).bind(login).first<{ rank: number }>();
  const allTimeRank = rankRow?.rank ?? 1;

  // Contributions: all OASIS comments by this contributor with PR info and per-comment reaction scores
  const contribRows = await env.DB.prepare(`
    SELECT
      pc.id            AS comment_id,
      pc.pr_id,
      pc.pr_number,
      pc.repo_name,
      pc.decision,
      pc.created_at    AS commented_at,
      pc.pr_created_at,
      pr.title         AS pr_title,
      pr.html_url      AS pr_url,
      pr.merged_upstream,
      -- Per-comment peer score: sum of peer_agreement for reactions on this comment
      COALESCE((
        SELECT SUM(0.25 + CASE WHEN cr.is_positive = 1 THEN 0.10 ELSE -0.50 END)
        FROM comment_reactions cr WHERE cr.comment_id = pc.id
      ), 0) AS peer_score_earned,
      -- Reaction counts for influencer badge display
      COALESCE((SELECT COUNT(*)                                  FROM comment_reactions cr WHERE cr.comment_id = pc.id), 0) AS total_reactions,
      COALESCE((SELECT SUM(CASE WHEN cr.is_positive = 1 THEN 1 ELSE 0 END) FROM comment_reactions cr WHERE cr.comment_id = pc.id), 0) AS positive_reactions,
      COALESCE((SELECT SUM(CASE WHEN cr.is_positive = 0 THEN 1 ELSE 0 END) FROM comment_reactions cr WHERE cr.comment_id = pc.id), 0) AS negative_reactions
    FROM pr_comments pc
    JOIN pull_requests pr ON pr.id = pc.pr_id
    WHERE pc.login = ?
    ORDER BY pc.created_at DESC
  `).bind(login).all<Record<string, unknown>>();

  // Compute per-comment bonuses in TypeScript (mirrors rebuildContributors logic)
  // Load all pr_comments for each PR this contributor commented on, to correctly
  // assign early_mover ranks and influencer titles
  const prIds = [...new Set(contribRows.results.map(r => r['pr_id'] as number))];

  // For each PR, load all comments (not just this contributor's) to compute ranks
  const prCommentsByPR = new Map<number, Array<{
    id: number; login: string; created_at: string; pr_created_at: string;
    total_reactions: number; positive_reactions: number; negative_reactions: number;
  }>>();

  for (const prId of prIds) {
    const allPRComments = await env.DB.prepare(`
      SELECT
        pc.id, pc.login, pc.created_at, pc.pr_created_at,
        COALESCE((SELECT COUNT(*) FROM comment_reactions cr WHERE cr.comment_id = pc.id), 0) AS total_reactions,
        COALESCE((SELECT SUM(CASE WHEN cr.is_positive = 1 THEN 1 ELSE 0 END) FROM comment_reactions cr WHERE cr.comment_id = pc.id), 0) AS positive_reactions,
        COALESCE((SELECT SUM(CASE WHEN cr.is_positive = 0 THEN 1 ELSE 0 END) FROM comment_reactions cr WHERE cr.comment_id = pc.id), 0) AS negative_reactions
      FROM pr_comments pc WHERE pc.pr_id = ?
      ORDER BY pc.created_at ASC
    `).bind(prId).all<{
      id: number; login: string; created_at: string; pr_created_at: string;
      total_reactions: number; positive_reactions: number; negative_reactions: number;
    }>();
    prCommentsByPR.set(prId, allPRComments.results);
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

  // Merge bonuses into contribution rows
  const contributions = contribRows.results.map(row => {
    const commentId = row['comment_id'] as number;
    const bonus = commentBonuses.get(commentId) ?? { early_mover: 0, early_bird: 0, influencer: 0 };
    return {
      ...row,
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
    FROM pull_requests p JOIN repos r ON r.name = p.repo_name
    GROUP BY p.repo_name ORDER BY ${col} ${dir}
  `).all();
  let results = rows.results;
  if (q) results = results.filter((r: Record<string, unknown>) =>
    String(r['repo_name'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}

export async function handleTools(env: Env, req: Request, url: URL): Promise<Response> {
  const { q } = parseQuery(url);

  const fixRows = await env.DB.prepare(`
    SELECT author, COUNT(*) AS total_prs, SUM(merged_upstream) AS accepted_upstream,
           COUNT(DISTINCT repo_name) AS projects_worked,
           SUM(COALESCE(oasis_comment_count, 0)) AS total_comments,
           SUM(consensus_accept) AS total_accept, SUM(consensus_modify) AS total_modify,
           SUM(consensus_reject) AS total_reject
    FROM pull_requests WHERE author IS NOT NULL GROUP BY author ORDER BY total_prs DESC
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

  const detectRows = await env.DB.prepare(`
    SELECT detection_tool, COUNT(*) AS vulnerabilities, COUNT(DISTINCT repo_name) AS projects_worked,
           SUM(merged_upstream) AS accepted_upstream,
           SUM(consensus_accept) AS total_accept, SUM(consensus_modify) AS total_modify,
           SUM(consensus_reject) AS total_reject
    FROM pull_requests WHERE detection_tool IS NOT NULL GROUP BY detection_tool ORDER BY vulnerabilities DESC
  `).all<{
    detection_tool: string;
    vulnerabilities: number;
    projects_worked: number;
    accepted_upstream: number | null;
    total_accept: number | null;
    total_modify: number | null;
    total_reject: number | null;
  }>();

  const tools: unknown[] = [];
  for (const [name, fix] of fixToolMap.entries()) {
    tools.push({
      name, role: 'fix', card_key: `fix:${name}`, login: fix.login,
      total_prs: fix.total_prs, vulnerabilities: fix.total_prs,
      accepted_upstream: fix.accepted_upstream, projects_worked: fix.projects_worked,
      interactions: fix.interactions, total_accept: fix.total_accept,
      total_modify: fix.total_modify, total_reject: fix.total_reject,
    });
  }
  for (const d of detectRows.results) {
    tools.push({
      name: d.detection_tool, role: 'detect', card_key: `detect:${d.detection_tool}`,
      login: null, total_prs: null, vulnerabilities: d.vulnerabilities,
      accepted_upstream: d.accepted_upstream ?? 0, projects_worked: d.projects_worked,
      interactions: null, total_accept: d.total_accept ?? 0,
      total_modify: d.total_modify ?? 0, total_reject: d.total_reject ?? 0,
    });
  }

  let results = tools;
  if (q) results = results.filter((r: unknown) =>
    String((r as Record<string, unknown>)['name'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
}
