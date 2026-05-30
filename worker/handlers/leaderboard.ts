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
  const VALID = new Set(['login','prs_worked','total_interactions','non_oasis_interactions',
    'reactions_received','accepts','modifies','rejects','reputation','avg_per_pr']);
  const col = VALID.has(sort) ? sort : 'reputation';
  const rows = await env.DB.prepare(`
    SELECT c.login, c.avatar_url, c.prs_worked, c.total_interactions,
           COALESCE(c.non_oasis_interactions, 0)  AS non_oasis_interactions,
           COALESCE(c.reactions_received, 0)       AS reactions_received,
           c.accepts, c.modifies, c.rejects,
           ROUND(c.total_interactions + COALESCE(c.reactions_received, 0) * 0.25, 2) AS reputation,
           CASE WHEN c.prs_worked > 0
             THEN ROUND(CAST(c.total_interactions AS REAL) / c.prs_worked, 2)
             ELSE 0 END AS avg_per_pr
    FROM contributors c ORDER BY ${col} ${dir}
  `).all();
  let results = rows.results;
  if (q) results = results.filter((r: Record<string, unknown>) =>
    String(r['login'] ?? '').toLowerCase().includes(q),
  );
  return lbResponse(results, req);
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
