/**
 * PR Panel proxy endpoints — serve GitHub API data for the slide-out PR panel.
 *
 * All endpoints look up repo_name + number from D1 by PR id, then proxy
 * the relevant GitHub API endpoints using the server-side GITHUB_TOKEN.
 * Reactions use the authenticated user's OAuth token.
 *
 * Routes (registered in index.ts):
 *   GET  /api/pr-panel/:id/details
 *   GET  /api/pr-panel/:id/files
 *   GET  /api/pr-panel/:id/comments
 *   POST /api/pr-panel/:id/react
 */

import type { Env } from '../types.js';
import { ghFetch, ghFetchAll, parseDecision, parseDetectionTool, ORG } from '../github.js';
import { jsonOk, jsonErr, validateCSRF } from '../security.js';
import { getSession } from './auth.js';

/* ─── REACTION TYPES ──────────────────────────────────────────── */
const VALID_REACTIONS = new Set(['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes']);

/* ─── SHARED: look up PR row in D1 ───────────────────────────── */
interface PRRow {
  repo_name: string;
  number: number;
  state: string;
}

async function getPRRow(env: Env, id: number): Promise<PRRow | null> {
  return env.DB.prepare(
    'SELECT repo_name, number, state FROM pull_requests WHERE id = ?',
  ).bind(id).first<PRRow>();
}

/* ─── GITHUB TYPES (local, minimal) ─────────────────────────── */
interface GHUser {
  login: string;
  avatar_url: string;
}

interface GHPRDetail {
  number: number;
  title: string;
  state: string;
  html_url: string;
  body: string | null;
  user: GHUser;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
  head: { sha: string };
}

interface GHFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

interface GHReactions {
  total_count: number;
  '+1': number;
  '-1': number;
  laugh: number;
  hooray: number;
  confused: number;
  heart: number;
  rocket: number;
  eyes: number;
}

interface GHComment {
  id: number;
  user: GHUser;
  body: string | null;
  created_at: string;
  reactions?: GHReactions;
}

/* ─── PARSERS ─────────────────────────────────────────────────── */
function parsePRMeta(title: string, body: string | null) {
  const cweMatch     = title.match(/CWE-(\d+)/i);
  const cweDescMatch = title.match(/CWE-\d+\s*\(([^)]+)\)/i);
  const severity     = title.match(/\b(critical|high|medium|low)\s+severity/i);
  const cveMatch     = (body ?? '').match(/CVE-(\d{4}-\d+)/i);
  const capecMatch   = (body ?? '').match(/CAPEC-(\d+)/i);
  const cvssMatch    = (body ?? '').match(/CVSS[:\s]+([0-9.]+)/i);
  const tldrMatch    = (body ?? '').match(/##\s*TL[;:]DR\s*\n([\s\S]*?)(?:\n##|\n---|\s*$)/i);

  return {
    cwe_id:        cweMatch    ? `CWE-${cweMatch[1]}`    : null,
    cwe_desc:      cweDescMatch ? cweDescMatch[1].trim()  : null,
    cvss_severity: severity    ? severity[1].toLowerCase() : null,
    cve_id:        cveMatch    ? `CVE-${cveMatch[1]}`    : null,
    capec_id:      capecMatch  ? `CAPEC-${capecMatch[1]}`: null,
    cvss_score:    cvssMatch   ? cvssMatch[1]             : null,
    tldr:          tldrMatch   ? tldrMatch[1].trim()      : null,
    detection_tool: parseDetectionTool(body),
  };
}

/* ─── GET /api/pr-panel/:id/details ──────────────────────────── */
export async function handlePRDetails(request: Request, env: Env, id: number): Promise<Response> {
  const pr = await getPRRow(env, id);
  if (!pr) return jsonErr('PR not found', 404, request);

  let ghPR: GHPRDetail;
  try {
    ghPR = await ghFetch<GHPRDetail>(
      `/repos/${ORG}/${pr.repo_name}/pulls/${pr.number}`,
      env.GITHUB_TOKEN,
    );
  } catch (err) {
    return jsonErr(`GitHub API error: ${(err as Error).message}`, 502, request);
  }

  const meta = parsePRMeta(ghPR.title, ghPR.body);

  return jsonOk({
    id,
    repo_name:     pr.repo_name,
    number:        ghPR.number,
    title:         ghPR.title,
    state:         ghPR.state,
    html_url:      ghPR.html_url,
    body:          ghPR.body ?? '',
    user: {
      login:      ghPR.user?.login ?? 'unknown',
      avatar_url: ghPR.user?.avatar_url ?? `https://github.com/${ghPR.user?.login ?? 'ghost'}.png?size=64`,
    },
    created_at:    ghPR.created_at,
    updated_at:    ghPR.updated_at,
    merged_at:     ghPR.merged_at ?? null,
    additions:     ghPR.additions,
    deletions:     ghPR.deletions,
    changed_files: ghPR.changed_files,
    head_sha:      ghPR.head?.sha ?? '',
    ...meta,
  }, request);
}

/* ─── GET /api/pr-panel/:id/files ────────────────────────────── */
export async function handlePRFiles(request: Request, env: Env, id: number): Promise<Response> {
  const pr = await getPRRow(env, id);
  if (!pr) return jsonErr('PR not found', 404, request);

  let files: GHFile[];
  try {
    files = await ghFetchAll<GHFile>(
      `/repos/${ORG}/${pr.repo_name}/pulls/${pr.number}/files`,
      env.GITHUB_TOKEN,
    );
  } catch (err) {
    return jsonErr(`GitHub API error: ${(err as Error).message}`, 502, request);
  }

  return jsonOk({
    files: files.map(f => ({
      filename:  f.filename,
      status:    f.status,
      additions: f.additions,
      deletions: f.deletions,
      changes:   f.changes,
      patch:     f.patch ?? null,
    })),
  }, request);
}

/* ─── GET /api/pr-panel/:id/comments ─────────────────────────── */
export async function handlePRComments(request: Request, env: Env, id: number): Promise<Response> {
  const pr = await getPRRow(env, id);
  if (!pr) return jsonErr('PR not found', 404, request);

  let comments: GHComment[];
  try {
    comments = await ghFetchAll<GHComment>(
      `/repos/${ORG}/${pr.repo_name}/issues/${pr.number}/comments`,
      env.GITHUB_TOKEN,
    );
  } catch (err) {
    return jsonErr(`GitHub API error: ${(err as Error).message}`, 502, request);
  }

  const result = comments.map(c => ({
    id:           c.id,
    user: {
      login:      c.user?.login ?? 'ghost',
      avatar_url: c.user?.avatar_url ?? `https://github.com/${c.user?.login ?? 'ghost'}.png?size=32`,
    },
    body:          c.body ?? '',
    created_at:    c.created_at,
    reactions: c.reactions ? {
      total_count: c.reactions.total_count,
      '+1':        c.reactions['+1'],
      '-1':        c.reactions['-1'],
      laugh:       c.reactions.laugh,
      hooray:      c.reactions.hooray,
      confused:    c.reactions.confused,
      heart:       c.reactions.heart,
      rocket:      c.reactions.rocket,
      eyes:        c.reactions.eyes,
    } : { total_count: 0, '+1': 0, '-1': 0, laugh: 0, hooray: 0, confused: 0, heart: 0, rocket: 0, eyes: 0 },
    oasis_decision: parseDecision(c.body),
  }));

  return jsonOk({ comments: result }, request);
}

/* ─── POST /api/pr-panel/:id/react ───────────────────────────── */
export async function handlePRReact(request: Request, env: Env, id: number): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  // Require authentication — user's own token is used so reactions appear as them
  const session = await getSession(request, env);
  if (!session) return jsonErr('Sign in to react', 401, request);

  const pr = await getPRRow(env, id);
  if (!pr) return jsonErr('PR not found', 404, request);

  let body: { comment_id?: unknown; reaction?: unknown };
  try {
    body = await request.json() as { comment_id?: unknown; reaction?: unknown };
  } catch {
    return jsonErr('Invalid JSON body', 400, request);
  }

  const commentId = Number(body.comment_id);
  const reaction  = String(body.reaction ?? '');

  if (!Number.isInteger(commentId) || commentId <= 0) {
    return jsonErr('Invalid comment_id', 400, request);
  }
  if (!VALID_REACTIONS.has(reaction)) {
    return jsonErr(`Invalid reaction. Must be one of: ${[...VALID_REACTIONS].join(', ')}`, 400, request);
  }

  // Use the user's OAuth token so the reaction appears as them
  const ghRes = await fetch(
    `https://api.github.com/repos/${ORG}/${pr.repo_name}/issues/comments/${commentId}/reactions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.github_token}`,
        Accept:        'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'oasis-worker-react/1.0',
      },
      body: JSON.stringify({ content: reaction }),
    },
  );

  if (ghRes.status === 403) {
    return jsonErr('Forbidden — you may need to re-authenticate', 403, request);
  }
  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => 'unknown error');
    return jsonErr(`GitHub API error ${ghRes.status}: ${text}`, 502, request);
  }

  return jsonOk({ ok: true }, request);
}
