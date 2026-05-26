/**
 * OWASP OASIS — Cloudflare Worker
 * Full security hardening — every input exception + duplicate handled
 * React SPA served via ASSETS binding; API routes handled by worker.
 */

/* ─── CONFIG ─────────────────────────────────────────────────── */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX        = 5;
const CSRF_COOKIE           = '__csrf';
const CSRF_HEADER           = 'x-csrf-token';
const MAX_BODY_BYTES        = 8_192;

/* ─── ALLOWED VALUES ─────────────────────────────────────────── */
const ALLOWED_ROLES   = new Set(['validator', 'sponsor', 'general', '']);
const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS', 'HEAD']);

/* ─── SECURITY HEADERS ───────────────────────────────────────── */
const SEC_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://www.appsecai.io https://cdn.prod.website-files.com https://avatars.githubusercontent.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Frame-Options':              'DENY',
  'X-Content-Type-Options':       'nosniff',
  'X-XSS-Protection':             '0',
  'Referrer-Policy':              'strict-origin-when-cross-origin',
  'Permissions-Policy':           'geolocation=(), camera=(), microphone=(), payment=()',
  'Strict-Transport-Security':    'max-age=63072000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const ALLOWED_ORIGINS = [
  'https://www.owasp-oasis.com',
  'https://owasp-oasis.com',
  'https://www.owasp-oasis.org',
  'https://owasp-oasis.org',
  'https://preview.owasp-oasis.bluejar.org',
];

function secHeaders(res, request) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEC_HEADERS)) r.headers.set(k, v);
  if (request) {
    const origin = request.headers.get('Origin') || '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      r.headers.set('Access-Control-Allow-Origin', origin);
      r.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }
  return r;
}

/* ─── RESPONSE HELPERS ───────────────────────────────────────── */
const jsonOk  = (data, req)            => secHeaders(Response.json({ ok: true,  ...data },     { status: 200 }), req);
const jsonErr = (msg, status=400, req) => secHeaders(Response.json({ ok: false, error: msg }, { status }), req);

/* ─── CORS preflight ─────────────────────────────────────────── */
function handleOptions(request) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':      allowOrigin,
      'Access-Control-Allow-Methods':     'GET, POST',
      'Access-Control-Allow-Headers':     'Content-Type, X-CSRF-Token',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age':           '86400',
    },
  });
}

/* ─── CSRF ───────────────────────────────────────────────────── */
function generateCSRF() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

function getCookieValue(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const match  = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function validateCSRF(request) {
  const cookieToken = getCookieValue(request, CSRF_COOKIE);
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) return false;
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
  if (!/^[0-9a-f]{64}$/.test(cookieToken)) return false;
  if (cookieToken.length !== headerToken.length) return false;
  let diff = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    diff |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return diff === 0;
}

/* ─── RATE LIMITING ──────────────────────────────────────────── */
async function checkRateLimit(env, ip) {
  if (!env.RATE_KV) return { allowed: true };
  const key = `rl:${await hashString(ip)}`;
  let count = 0;
  try {
    const raw = await env.RATE_KV.get(key);
    count = raw ? parseInt(raw, 10) : 0;
    if (isNaN(count) || count < 0) count = 0;
  } catch {
    return { allowed: true };
  }
  if (count >= RATE_LIMIT_MAX) return { allowed: false };
  try {
    await env.RATE_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  } catch { /* non-fatal */ }
  return { allowed: true };
}

/* ─── INPUT VALIDATION ───────────────────────────────────────── */
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const GH_RE    = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const MAX      = { email: 254, name: 100, github: 39, org: 120, why: 1000 };

function sanitize(val) {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function vEmail(val) {
  const v = sanitize(val).toLowerCase();
  if (!v) return { ok: false, error: 'Email is required' };
  if (v.length > MAX.email) return { ok: false, error: 'Email address is too long' };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Please enter a valid email address' };
  const domain = v.split('@')[1].toLowerCase();
  const blocked = ['test.com', 'example.com', 'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com'];
  if (blocked.includes(domain)) return { ok: false, error: 'Please use a real email address' };
  return { ok: true, val: v };
}

function vName(val) {
  const v = sanitize(val);
  if (!v) return { ok: false, error: 'Name is required' };
  if (v.length < 2) return { ok: false, error: 'Name must be at least 2 characters' };
  if (v.length > MAX.name) return { ok: false, error: 'Name is too long' };
  return { ok: true, val: v };
}

function vGitHub(val) {
  const v = sanitize(val).replace(/^@/, '');
  if (!v) return { ok: true, val: '' };
  if (v.length > MAX.github) return { ok: false, error: 'GitHub username is too long (max 39 chars)' };
  if (v.startsWith('-') || v.endsWith('-')) return { ok: false, error: 'GitHub username cannot start or end with a hyphen' };
  if (!GH_RE.test(v)) return { ok: false, error: 'Invalid GitHub username format' };
  return { ok: true, val: v };
}

function vRole(val) {
  const v = sanitize(val);
  if (!ALLOWED_ROLES.has(v)) return { ok: false, error: 'Invalid role' };
  return { ok: true, val: v };
}

/* ─── BODY PARSER ────────────────────────────────────────────── */
async function parseBody(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) return { ok: false, error: 'Content-Type must be application/json' };
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) return { ok: false, error: 'Request body too large' };
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'Request body too large' };
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON in request body' };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  return { ok: true, val: body };
}

/* ─── HASH HELPER ────────────────────────────────────────────── */
async function hashString(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

/* ─── DUPLICATE CHECK HELPERS ────────────────────────────────── */
async function isEmailRegistered(env, email) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare('SELECT id FROM registrations WHERE email = ? LIMIT 1').bind(email).first();
    return !!row;
  } catch { return false; }
}

/* ─── LEADERBOARD HELPERS ────────────────────────────────────── */
const BOT_TO_TOOL = {
  'appsecai-app[bot]': 'AppSecAI',
  'appsecai-bot':      'AppSecAI',
  'dryrun-bot':        'DryRun Security',
  'dryrun-security':   'DryRun Security',
};

function lbJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function parseQuery(url) {
  const sort = url.searchParams.get('sort') ?? '';
  const dir  = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const q    = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  return { sort, dir, q };
}

async function handleMeta(env) {
  const row     = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'last_synced_at'").first();
  const running = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'sync_running'").first();
  return lbJson({ last_synced_at: row?.value ?? null, sync_running: running?.value === '1' });
}

async function handleRepos(env, url) {
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
  if (q) results = results.filter(r =>
    String(r.name ?? '').toLowerCase().includes(q) ||
    String(r.language ?? '').toLowerCase().includes(q) ||
    String(r.description ?? '').toLowerCase().includes(q)
  );
  return lbJson(results);
}

async function handlePRs(env, url) {
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
  if (q) results = results.filter(r =>
    String(r.repo_name ?? '').toLowerCase().includes(q) ||
    String(r.title ?? '').toLowerCase().includes(q) ||
    String(r.author ?? '').toLowerCase().includes(q)
  );
  return lbJson(results);
}

async function handleContributors(env, url) {
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
  if (q) results = results.filter(r => String(r.login ?? '').toLowerCase().includes(q));
  return lbJson(results);
}

async function handleMaintainers(env, url) {
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
  if (q) results = results.filter(r => String(r.repo_name ?? '').toLowerCase().includes(q));
  return lbJson(results);
}

async function handleTools(env, url) {
  const { q } = parseQuery(url);
  const fixRows = await env.DB.prepare(`
    SELECT author, COUNT(*) AS total_prs, SUM(merged_upstream) AS accepted_upstream,
           COUNT(DISTINCT repo_name) AS projects_worked,
           SUM(COALESCE(oasis_comment_count, 0)) AS total_comments,
           SUM(consensus_accept) AS total_accept, SUM(consensus_modify) AS total_modify,
           SUM(consensus_reject) AS total_reject
    FROM pull_requests WHERE author IS NOT NULL GROUP BY author ORDER BY total_prs DESC
  `).all();

  const fixToolMap = new Map();
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
  `).all();

  const tools = [];
  for (const [name, fix] of fixToolMap.entries()) {
    tools.push({ name, role: 'fix', card_key: `fix:${name}`, login: fix.login,
      total_prs: fix.total_prs, vulnerabilities: fix.total_prs,
      accepted_upstream: fix.accepted_upstream, projects_worked: fix.projects_worked,
      interactions: fix.interactions, total_accept: fix.total_accept,
      total_modify: fix.total_modify, total_reject: fix.total_reject });
  }
  for (const d of detectRows.results) {
    tools.push({ name: d.detection_tool, role: 'detect', card_key: `detect:${d.detection_tool}`,
      login: null, total_prs: null, vulnerabilities: d.vulnerabilities,
      accepted_upstream: d.accepted_upstream ?? 0, projects_worked: d.projects_worked,
      interactions: null, total_accept: d.total_accept ?? 0,
      total_modify: d.total_modify ?? 0, total_reject: d.total_reject ?? 0 });
  }

  let results = tools;
  if (q) results = results.filter(r => String(r.name ?? '').toLowerCase().includes(q));
  return lbJson(results);
}

/* ─── GITHUB SYNC ────────────────────────────────────────────── */
const ORG = 'owasp-oasis';
const META_REPOS = new Set(['project-overview', 'project-planning', 'project-website']);

async function ghFetch(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'oasis-worker-sync/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} → ${res.status}`);
  return res.json();
}

async function ghFetchAll(path, token) {
  const results = [];
  let page = 1;
  while (true) {
    const sep  = path.includes('?') ? '&' : '?';
    const data = await ghFetch(`${path}${sep}per_page=100&page=${page}`, token);
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

function parseDecision(body) {
  if (!body) return null;
  const lower = body.toLowerCase();
  if (!lower.includes('validation summary:') && !lower.includes('rejection summary:')) return null;
  if (lower.includes('rejection summary:') && lower.includes('reject')) return 'reject';
  if (lower.includes('validation summary:')) {
    for (const line of body.split('\n')) {
      const l = line.toLowerCase();
      if (l.includes('decision')) {
        if (l.includes('accept')) return 'accept';
        if (l.includes('modify')) return 'modify';
        if (l.includes('reject')) return 'reject';
      }
    }
  }
  return null;
}

function parseDetectionTool(body) {
  if (!body) return null;
  const m = body.match(/\*\*[Dd]etected\s+[Bb]y[:\*]+\*?\*?\s*([^\n*|]+)/);
  if (m) return normaliseToolName(m[1]);
  if (/appsecai-diff-hash/i.test(body) || /AppSecAI Vulnerability ID/i.test(body)) return 'AppSecAI';
  if (/[Dd]etected\s+[Bb]y[:\s]+AppSec\s*AI/i.test(body)) return 'AppSecAI';
  if (/Semgrep\s+OSS/i.test(body)) return 'Semgrep OSS';
  if (/OpenGrep/i.test(body)) return 'OpenGrep';
  if (/\b(javascript|python|java|go|ruby)\.[a-z]+\.[a-z]+\.[a-z]/.test(body)) return 'Semgrep OSS';
  if (/##\s+What\s+SAST\s+Found/i.test(body)) return 'SAST (unknown)';
  return null;
}

function normaliseToolName(raw) {
  const l = raw.trim().toLowerCase();
  if (l.includes('appsec') || l.includes('fenix')) return 'AppSecAI';
  if (l.includes('opengrep')) return 'OpenGrep';
  if (l.includes('semgrep')) return 'Semgrep OSS';
  return raw.trim().slice(0, 60) || 'SAST (unknown)';
}

// Detect automated/bot accounts that should not appear in OASIS tracking.
// Checks both the [bot] GitHub suffix and common patterns in the login name.
// Real humans very rarely use these strings in GitHub usernames.
function isAutomatedAccount(login) {
  if (!login) return true;
  const l = login.toLowerCase();
  return (
    login.endsWith('[bot]')       ||
    l.includes('bot')             ||
    l.includes('ci')              ||
    l.includes('auto')            ||
    l.includes('deploy')          ||
    l.includes('release')         ||
    l.includes('dependabot')      ||
    l.includes('renovate')        ||
    l.includes('stale')           ||
    l.includes('codecov')         ||
    l.includes('coveralls')       ||
    l.includes('imgbot')          ||
    l.includes('allcontributors') ||
    l.includes('snyk')            ||
    l.includes('sonar')
  );
}

async function getSyncState(db, key) {
  const row = await db.prepare('SELECT value FROM sync_state WHERE key = ?').bind(key).first();
  return row?.value ?? '2020-01-01T00:00:00Z';
}

async function setSyncState(db, key, value) {
  await db.prepare('INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)').bind(key, value).run();
}

async function rebuildContributors(db, syncStart) {
  const rows = await db.prepare(`
    SELECT login,
           COUNT(DISTINCT pr_id)                                          AS prs_worked,
           SUM(interactions)                                               AS total_interactions,
           SUM(COALESCE(non_oasis_interactions, 0))                        AS non_oasis_interactions,
           SUM(reactions_received)                                          AS reactions_received,
           SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END)            AS accepts,
           SUM(CASE WHEN decision = 'modify' THEN 1 ELSE 0 END)            AS modifies,
           SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END)            AS rejects
    FROM pr_participants GROUP BY login
  `).all();

  for (const row of rows.results) {
    const existing = await db.prepare('SELECT avatar_url FROM contributors WHERE login = ?').bind(row.login).first();
    await db.prepare(`
      INSERT OR REPLACE INTO contributors
        (login, avatar_url, prs_worked, total_interactions, non_oasis_interactions,
         reactions_received, accepts, modifies, rejects, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.login,
      existing?.avatar_url ?? `https://github.com/${row.login}.png?size=64`,
      row.prs_worked, row.total_interactions, row.non_oasis_interactions ?? 0,
      row.reactions_received ?? 0,
      row.accepts, row.modifies, row.rejects, syncStart
    ).run();
  }
}

async function runSync(env) {
  const token = env.GITHUB_TOKEN;
  const db    = env.DB;
  const stats = { repos: 0, prs: 0, comments: 0 };

  try {
    const since     = await getSyncState(db, 'last_synced_at');
    const syncStart = new Date().toISOString();
    const allRepos  = await ghFetchAll(`/orgs/${ORG}/repos?type=public`, token);
    const repos     = allRepos.filter(r => r.fork && !META_REPOS.has(r.name));

    for (const repo of repos) {
      const detail       = await ghFetch(`/repos/${ORG}/${repo.name}`, token);
      const upstreamUrl  = detail.parent?.html_url ?? null;

      await db.prepare(`
        INSERT OR REPLACE INTO repos (id, name, full_name, description, language, open_prs, stars, upstream_url, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(repo.id, repo.name, repo.full_name, repo.description ?? null,
        repo.language ?? null, 0, repo.stargazers_count, upstreamUrl, syncStart).run();
      stats.repos++;

      const openPRs   = await ghFetchAll(`/repos/${ORG}/${repo.name}/pulls?state=open&sort=updated&direction=desc`, token);
      const closedPRs = await ghFetchAll(`/repos/${ORG}/${repo.name}/pulls?state=closed&sort=updated&direction=desc`, token);
      const prs       = [...openPRs, ...closedPRs].filter(pr => pr.updated_at >= since);

      for (const pr of prs) {
        stats.prs++;
        const participantMap = new Map();
        const ensure = l => {
          if (!participantMap.has(l)) participantMap.set(l, { interactions: 0, non_oasis_interactions: 0, decision: null, reactions_received: 0 });
          return participantMap.get(l);
        };

        const comments = await ghFetchAll(`/repos/${ORG}/${repo.name}/issues/${pr.number}/comments`, token);
        stats.comments += comments.length;

        let consensusAccept = 0, consensusModify = 0, consensusReject = 0;
        let oasisCommentCount = 0, nonOasisCommentCount = 0;

        for (const comment of comments) {
          const login = comment.user?.login;
          // Skip automated/bot accounts — they must not appear in any OASIS tracking
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
          } else {
            // Non-OASIS comment — tracked separately, does NOT affect reputation,
            // consensus, trust status, or contributor counts
            p.non_oasis_interactions++;
            nonOasisCommentCount++;
            continue; // skip reactions fetch — non-OASIS engagement is not credited
          }
          // Reactions are only fetched for OASIS-template comments
          try {
            const reactions = await ghFetchAll(`/repos/${ORG}/${repo.name}/issues/comments/${comment.id}/reactions`, token);
            for (const rxn of reactions) {
              const rLogin = rxn.user?.login;
              // Skip self-reactions, bots, and automated accounts
              if (!rLogin || rLogin === login || isAutomatedAccount(rLogin)) continue;
              p.reactions_received++;
              if (rxn.content === '+1' && decision) {
                if (decision === 'accept') consensusAccept++;
                if (decision === 'modify') consensusModify++;
                if (decision === 'reject') consensusReject++;
              }
              ensure(rLogin).interactions++;
            }
          } catch { /* skip */ }
        }

        // participants = only those who left at least one OASIS-template comment
        // (non-OASIS commenters are tracked but don't count toward trust thresholds)
        const oasisParticipantCount = [...participantMap.values()].filter(p => p.decision !== null).length;

        const detectionTool = parseDetectionTool(pr.body);
        const existingRow   = await db.prepare('SELECT merged_upstream FROM pull_requests WHERE repo_name = ? AND number = ?').bind(repo.name, pr.number).first();
        const mergedUpstream = existingRow?.merged_upstream ?? 0;
        const state = pr.state === 'open' ? 'open' : 'closed';

        await db.prepare(`
          INSERT OR REPLACE INTO pull_requests
            (id, repo_name, number, title, state, author, html_url, comment_count,
             oasis_comment_count, non_oasis_comment_count,
             participants, consensus_accept, consensus_modify, consensus_reject,
             merged_upstream, head_sha, merged_at, created_at, updated_at, detection_tool, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          pr.id, repo.name, pr.number, pr.title, state,
          pr.user?.login ?? null, pr.html_url, comments.length,
          oasisCommentCount, nonOasisCommentCount,
          oasisParticipantCount, consensusAccept, consensusModify, consensusReject,
          mergedUpstream, pr.head?.sha ?? null, pr.merged_at ?? null,
          pr.created_at, pr.updated_at, detectionTool ?? null, syncStart
        ).run();

        for (const [login, data] of participantMap.entries()) {
          await db.prepare(`
            INSERT OR REPLACE INTO pr_participants
              (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision, reactions_received)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(pr.id, repo.name, pr.number, login, data.interactions, data.non_oasis_interactions, data.decision ?? null, data.reactions_received).run();
        }
      }

      const openCount = await db.prepare("SELECT COUNT(*) as c FROM pull_requests WHERE repo_name = ? AND state = 'open'").bind(repo.name).first();
      await db.prepare('UPDATE repos SET open_prs = ?, synced_at = ? WHERE name = ?').bind(openCount?.c ?? 0, syncStart, repo.name).run();
    }

    await rebuildContributors(db, syncStart);
    await setSyncState(db, 'last_synced_at', syncStart);
    await setSyncState(db, 'sync_running', '0');
    return { ok: true, message: `Sync complete at ${syncStart}`, stats };
  } catch (err) {
    await setSyncState(db, 'sync_running', '0');
    return { ok: false, message: err?.message ?? String(err), stats };
  }
}

/* ─── REGISTER HANDLER ───────────────────────────────────────── */
async function handleRegister(request, env) {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  // name is optional for the React form (project-website style)
  const nameVal = body.name ? body.name : (body.email ? body.email.split('@')[0] : '');
  const nameRes = vName(nameVal);
  if (!nameRes.ok) return jsonErr(nameRes.error, 400, request);

  const emailRes = vEmail(body.email);
  if (!emailRes.ok) return jsonErr(emailRes.error, 400, request);

  const ghRes = vGitHub(body.github ?? '');
  if (!ghRes.ok) return jsonErr(ghRes.error, 400, request);

  // Accept both 'role' and 'type' fields for compatibility
  const roleVal = body.role ?? body.type ?? '';
  const roleRes = vRole(roleVal);
  if (!roleRes.ok) return jsonErr(roleRes.error, 400, request);

  const isDuplicate = await isEmailRegistered(env, emailRes.val);
  if (isDuplicate) return jsonOk({ message: 'You\'re already registered. We\'ll be in touch!' }, request);

  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO registrations (name, email, github, role, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(nameRes.val, emailRes.val, ghRes.val, roleRes.val, await hashString(ip), new Date().toISOString()).run();
    } catch (err) {
      if (err?.message?.includes('UNIQUE') || err?.message?.includes('constraint')) {
        return jsonOk({ message: 'You\'re already registered. We\'ll be in touch!' }, request);
      }
      console.error('DB error (register):', err?.message);
      return jsonErr('Registration failed — please try again.', 500, request);
    }
  }

  return jsonOk({ message: 'Registered successfully. We\'ll be in touch!' }, request);
}

async function handleFeedback(request, env) {
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  const description = (body.description ?? '').toString().trim();
  if (!description || description.length < 10) {
    return jsonErr('Description must be at least 10 characters.', 400, request);
  }
  if (description.length > 5000) {
    return jsonErr('Description must be 5000 characters or fewer.', 400, request);
  }

  const VALID_SEVERITY = new Set(['bug', 'suggestion', 'other']);
  const severity = VALID_SEVERITY.has(body.severity) ? body.severity : 'other';

  const contact = (body.contact ?? '').toString().trim().slice(0, 200) || null;

  const token = env.GITHUB_TOKEN;
  if (!token) {
    console.error('handleFeedback: GITHUB_TOKEN not set');
    return jsonErr('Feedback service unavailable.', 503, request);
  }

  const severityLabel = severity === 'bug' ? '[Bug]' : severity === 'suggestion' ? '[Suggestion]' : '[Feedback]';
  const issueTitle = `${severityLabel} Preview site feedback`;
  const issueBody = [
    `**Type:** ${severity}`,
    contact ? `**Contact:** ${contact}` : null,
    '',
    '**Description:**',
    description,
    '',
    '---',
    `_Submitted via preview site feedback form on ${new Date().toUTCString()}_`,
  ].filter(line => line !== null).join('\n');

  const ghRes = await fetch('https://api.github.com/repos/owasp-oasis/owasp-oasis-app/issues', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'owasp-oasis-worker/1.0',
    },
    body: JSON.stringify({ title: issueTitle, body: issueBody, labels: ['preview-feedback'] }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text().catch(() => '');
    console.error('GitHub issue creation failed:', ghRes.status, errText);
    return jsonErr('Failed to submit feedback. Please try again.', 502, request);
  }

  return jsonOk({ message: 'Feedback submitted. Thank you!' }, request);
}

/* ─── MAIN HANDLER ───────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method;

    if (!ALLOWED_METHODS.has(method)) {
      return secHeaders(new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, POST, OPTIONS, HEAD' } }));
    }

    if (method === 'OPTIONS') return handleOptions(request);

    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost' ||
                    url.hostname === '0.0.0.0'   || (env.ENVIRONMENT !== 'production');

    if (url.protocol === 'http:' && !isLocal) {
      return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
    }

    if (!isLocal && url.hostname === 'owasp-oasis.com') {
      return Response.redirect(`https://www.owasp-oasis.com${url.pathname}${url.search}`, 301);
    }
    if (!isLocal && url.hostname === 'owasp-oasis.org') {
      return Response.redirect(`https://www.owasp-oasis.org${url.pathname}${url.search}`, 301);
    }

    try {
      /* GET /api/csrf — generate CSRF token, set cookie, return token */
      if (method === 'GET' && url.pathname === '/api/csrf') {
        const csrf = generateCSRF();
        const res = Response.json({ token: csrf }, { status: 200 });
        const r = secHeaders(res, request);
        r.headers.set('Set-Cookie',
          `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=Strict; Secure; HttpOnly; Max-Age=3600`);
        r.headers.set('Cache-Control', 'no-store');
        return r;
      }

      /* GET /api/count */
      if (method === 'GET' && url.pathname === '/api/count') {
        try {
          const row = env.DB ? await env.DB.prepare('SELECT COUNT(*) as count FROM registrations').first() : { count: 0 };
          return jsonOk({ count: row?.count || 0 }, request);
        } catch { return jsonOk({ count: 0 }, request); }
      }

      /* POST /api/register */
      if (method === 'POST' && url.pathname === '/api/register') {
        return handleRegister(request, env);
      }

      /* POST /api/feedback — create GitHub issue for preview site feedback */
      if (method === 'POST' && url.pathname === '/api/feedback') {
        return handleFeedback(request, env);
      }

      /* GET /api/admin/registrations */
      if (method === 'GET' && url.pathname === '/api/admin/registrations') {
        const secret    = request.headers.get('X-Admin-Secret');
        const envSecret = env.ADMIN_SECRET || '';
        if (!secret || !envSecret || secret !== envSecret) return jsonErr('Unauthorised', 401, request);
        try {
          const rows = await env.DB.prepare(
            'SELECT id, name, email, github, role, created_at FROM registrations ORDER BY created_at DESC'
          ).all();
          return jsonOk({ registrations: rows.results || [] }, request);
        } catch (err) {
          console.error('DB error (admin):', err?.message);
          return jsonErr('Failed to fetch registrations', 500, request);
        }
      }

      /* Leaderboard API */
      if (method === 'GET' && url.pathname === '/api/leaderboard/meta')         return handleMeta(env);
      if (method === 'GET' && url.pathname === '/api/leaderboard/repos')        return handleRepos(env, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/prs')          return handlePRs(env, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/contributors') return handleContributors(env, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/maintainers')  return handleMaintainers(env, url);
      if (method === 'GET' && url.pathname === '/api/leaderboard/tools')        return handleTools(env, url);

      /* Manual sync trigger */
      if (method === 'GET' && url.pathname === '/leaderboard-refresh') {
        if (!env.DB) return jsonErr('DB not available', 503, request);
        const lastManual = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'last_manual_sync'").first();
        if (lastManual?.value) {
          const elapsed = Date.now() - new Date(lastManual.value).getTime();
          if (elapsed < 10 * 60 * 1000) {
            const waitSec = Math.ceil((10 * 60 * 1000 - elapsed) / 1000);
            return jsonErr(`Rate-limited. Try again in ${waitSec}s.`, 429, request);
          }
        }
        await env.DB.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')").run();
        await env.DB.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_manual_sync', ?)").bind(new Date().toISOString()).run();
        const result = await runSync(env);
        return Response.json(result);
      }

      /* All other routes — serve React SPA via ASSETS */
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }

      return new Response('Not found', { status: 404 });

    } catch (err) {
      console.error('Unhandled Worker error:', err?.message);
      return jsonErr('An unexpected error occurred. Please try again.', 500);
    }
  },

  /* Cron — every 4 hours */
  async scheduled(_event, env, _ctx) {
    console.log('Starting scheduled GitHub sync...');
    if (env.DB) {
      await env.DB.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')").run();
    }
    const result = await runSync(env);
    console.log('Sync result:', JSON.stringify(result));
  },
};
