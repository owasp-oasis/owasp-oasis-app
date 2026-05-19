/**
 * OWASP OASIS — Cloudflare Worker
 * Full security hardening — every input exception + duplicate handled
 */

import HTML         from './index.html';
import ABOUT_HTML   from './about.html';
import OVERVIEW_HTML from './overview.html';
import LEADERBOARDS_HTML from './leaderboards.html';
import SPONSORS_HTML from './sponsors.html';

/* ─── CONFIG ─────────────────────────────────────────────────── */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX        = 5;
const CSRF_COOKIE           = '__csrf';
const CSRF_HEADER           = 'x-csrf-token';
const MAX_BODY_BYTES        = 8_192; // 8KB max request body — prevents DoS via large payloads

/* ─── ALLOWED VALUES (whitelist approach) ────────────────────── */
const ALLOWED_ROLES         = new Set(['validator', 'general', 'sponsor', '']);
const ALLOWED_METHODS       = new Set(['GET', 'POST', 'OPTIONS', 'HEAD']);

/* ─── SECURITY HEADERS ───────────────────────────────────────── */
const SEC_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://www.appsecai.io https://cdn.prod.website-files.com https://avatars.githubusercontent.com https://github.com",
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

function secHeaders(res, request) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEC_HEADERS)) r.headers.set(k, v);
  // Allow both .com and .org origins for API responses
  if (request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ['https://www.owasp-oasis.com','https://www.owasp-oasis.org',
                     'https://owasp-oasis.com','https://owasp-oasis.org'];
    if (allowed.includes(origin)) {
      r.headers.set('Access-Control-Allow-Origin', origin);
      r.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }
  return r;
}

/* ─── RESPONSE HELPERS ───────────────────────────────────────── */
const jsonOk  = (data, req)        => secHeaders(Response.json({ ok: true,  ...data },     { status: 200 }), req);
const jsonErr = (msg, status=400, req) => secHeaders(Response.json({ ok: false, error: msg }, { status }), req);

/* ─── CORS (same-origin only — no external API access) ──────── */
function handleOptions(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ['https://www.owasp-oasis.com','https://www.owasp-oasis.org',
                   'https://owasp-oasis.com','https://owasp-oasis.org'];
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age':       '86400',
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
  // Safe regex — name is a constant, never user input
  const match  = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function validateCSRF(request) {
  const cookieToken = getCookieValue(request, CSRF_COOKIE);
  const headerToken = request.headers.get(CSRF_HEADER);
  // Both must be present and non-empty
  if (!cookieToken || !headerToken) return false;
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
  // Must be exactly 64 hex chars (32 bytes)
  if (!/^[0-9a-f]{64}$/.test(cookieToken)) return false;
  if (cookieToken.length !== headerToken.length) return false;
  // Constant-time comparison — prevents timing side-channel
  let diff = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    diff |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return diff === 0;
}

/* ─── RATE LIMITING ──────────────────────────────────────────── */
async function checkRateLimit(env, ip) {
  if (!env.RATE_KV) return { allowed: true }; // skip if KV not bound
  const key = `rl:${await hashString(ip)}`; // hash IP in key too
  let count = 0;
  try {
    const raw = await env.RATE_KV.get(key);
    count = raw ? parseInt(raw, 10) : 0;
    if (isNaN(count) || count < 0) count = 0;
  } catch {
    // KV read failure — fail open (don't block user for infra issues)
    return { allowed: true };
  }
  if (count >= RATE_LIMIT_MAX) return { allowed: false };
  try {
    await env.RATE_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SEC });
  } catch {
    // KV write failure — non-fatal, still allow
  }
  return { allowed: true };
}

/* ─── INPUT VALIDATION ───────────────────────────────────────── */
// RFC 5322 simplified — catches obvious invalids, allows legit addresses
const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const GH_RE    = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const MAX      = { email: 254, name: 100, github: 39, org: 120, why: 1000 };

function sanitize(val) {
  if (val === null || val === undefined) return '';
  if (typeof val !== 'string') return '';       // reject non-strings entirely
  return val
    .replace(/<[^>]*>/g, '')                    // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .trim();
}

function vEmail(val) {
  const v = sanitize(val);
  if (!v)                return { ok: false, error: 'Email is required' };
  if (v.length > MAX.email) return { ok: false, error: 'Email address is too long' };
  if (!EMAIL_RE.test(v)) return { ok: false, error: 'Please enter a valid email address' };
  // Block disposable/test domains
  const domain = v.split('@')[1].toLowerCase();
  const blocked = ['test.com', 'example.com', 'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwam.com'];
  if (blocked.includes(domain)) return { ok: false, error: 'Please use a real email address' };
  return { ok: true, val: v.toLowerCase() };
}

function vName(val) {
  const v = sanitize(val);
  if (!v)                return { ok: false, error: 'Name is required' };
  if (v.length < 2)      return { ok: false, error: 'Name must be at least 2 characters' };
  if (v.length > MAX.name) return { ok: false, error: 'Name is too long' };
  return { ok: true, val: v };
}

function vGitHub(val) {
  const v = sanitize(val).replace(/^@/, '');
  if (!v) return { ok: true, val: '' }; // optional
  if (v.length > MAX.github) return { ok: false, error: 'GitHub username is too long (max 39 chars)' };
  if (v.startsWith('-') || v.endsWith('-')) return { ok: false, error: 'GitHub username cannot start or end with a hyphen' };
  if (!GH_RE.test(v))  return { ok: false, error: 'Invalid GitHub username format' };
  return { ok: true, val: v };
}

function vText(val, max, fieldName = 'Field') {
  const v = sanitize(val);
  if (v.length > max)  return { ok: false, error: `${fieldName} is too long (max ${max} chars)` };
  return { ok: true, val: v };
}

function vRole(val) {
  const v = sanitize(val);
  if (!ALLOWED_ROLES.has(v)) return { ok: false, error: 'Invalid role' };
  return { ok: true, val: v };
}

/* ─── BODY PARSER — size-limited, typed ─────────────────────── */
async function parseBody(request) {
  // Reject if Content-Type is not application/json
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.includes('application/json')) {
    return { ok: false, error: 'Content-Type must be application/json' };
  }
  // Enforce max body size
  const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    return { ok: false, error: 'Request body too large' };
  }
  let body;
  try {
    // Read with size limit
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, error: 'Request body too large' };
    body = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON in request body' };
  }
  // Must be a plain object — reject arrays, strings, null
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
    const row = await env.DB.prepare(
      'SELECT id FROM registrations WHERE email = ? LIMIT 1'
    ).bind(email).first();
    return !!row;
  } catch {
    return false; // fail open — don't block registration on DB read error
  }
}

async function isAlreadyApplied(env, email, role) {
  if (!env.DB) return false;
  try {
    const row = await env.DB.prepare(
      'SELECT id FROM applications WHERE email = ? AND role = ? LIMIT 1'
    ).bind(email, role).first();
    return !!row;
  } catch {
    return false;
  }
}

/* ─── MAIN HANDLER ───────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method;

    /* Block unsupported HTTP methods */
    if (!ALLOWED_METHODS.has(method)) {
      return secHeaders(new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: 'GET, POST, OPTIONS, HEAD' },
      }));
    }

    /* Handle CORS preflight */
    if (method === 'OPTIONS') return handleOptions(request);

    /* HTTPS enforcement — skip on localhost / local dev */
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost' ||
                    url.hostname === '0.0.0.0'   || url.port !== '' ||
                    (env.ENVIRONMENT !== 'production');
    if (url.protocol === 'http:' && !isLocal) {
      return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
    }

    /* Apex → www redirect (.com and .org) */
    if (!isLocal && url.hostname === 'owasp-oasis.com') {
      return Response.redirect(`https://www.owasp-oasis.com${url.pathname}${url.search}`, 301);
    }
    if (!isLocal && url.hostname === 'owasp-oasis.org') {
      return Response.redirect(`https://www.owasp-oasis.org${url.pathname}${url.search}`, 301);
    }

    /* Wrap everything in a top-level try/catch — no unhandled Worker crashes */
    try {

      /* GET / — serve HTML */
      if ((method === 'GET' || method === 'HEAD') &&
          (url.pathname === '/' || url.pathname === '/index.html')) {
        const csrf = generateCSRF();
        const html = HTML.replace(
          '<meta name="csrf-token" content=""/><!-- Injected by Cloudflare Worker -->',
          `<meta name="csrf-token" content="${csrf}"/>`
        );
        return secHeaders(new Response(method === 'HEAD' ? null : html, {
          status: 200,
          headers: {
            'Content-Type':  'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Set-Cookie':    `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=Strict; Secure; HttpOnly; Max-Age=3600`,
          },
        }));
      }

      /* GET /api/count */
      if (method === 'GET' && url.pathname === '/api/count') {
        try {
          const row = env.DB ? await env.DB.prepare(
            'SELECT COUNT(*) as count FROM registrations'
          ).first() : { count: 0 };
          return jsonOk({ count: row?.count || 0 }, request);
        } catch {
          return jsonOk({ count: 0 }, request);
        }
      }

      /* POST /api/register */
      if (method === 'POST' && url.pathname === '/api/register') {
        return await handleRegister(request, env);
      }

      /* POST /api/apply */
      if (method === 'POST' && url.pathname === '/api/apply') {
        return await handleApply(request, env);
      }

      /* GET /about */
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/about') {
        return secHeaders(new Response(method === 'HEAD' ? null : ABOUT_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
        }));
      }

      /* GET /overview */
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/overview') {
        return secHeaders(new Response(method === 'HEAD' ? null : OVERVIEW_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
        }));
      }

      /* GET /leaderboards */
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/leaderboards') {
        return secHeaders(new Response(method === 'HEAD' ? null : LEADERBOARDS_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
        }));
      }

      /* GET /sponsors — needs CSRF for sponsor form */
      if ((method === 'GET' || method === 'HEAD') && url.pathname === '/sponsors') {
        const csrf = generateCSRF();
        const html = SPONSORS_HTML.replace(
          '<meta name="csrf-token" content=""/><!-- Injected by Cloudflare Worker -->',
          `<meta name="csrf-token" content="${csrf}"/>`
        );
        return secHeaders(new Response(method === 'HEAD' ? null : html, {
          status: 200,
          headers: {
            'Content-Type':  'text/html; charset=utf-8',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Set-Cookie':    `${CSRF_COOKIE}=${csrf}; Path=/; SameSite=Strict; Secure; HttpOnly; Max-Age=3600`,
          },
        }));
      }

      /* GET /api/leaderboard/meta */
      if (method === 'GET' && url.pathname === '/api/leaderboard/meta') {
        return await handleLeaderboardMeta(env, request);
      }

      /* GET /api/leaderboard/repos */
      if (method === 'GET' && url.pathname === '/api/leaderboard/repos') {
        return await handleLeaderboardRepos(env, url, request);
      }

      /* GET /api/leaderboard/prs */
      if (method === 'GET' && url.pathname === '/api/leaderboard/prs') {
        return await handleLeaderboardPRs(env, url, request);
      }

      /* GET /api/leaderboard/contributors */
      if (method === 'GET' && url.pathname === '/api/leaderboard/contributors') {
        return await handleLeaderboardContributors(env, url, request);
      }

      /* GET /api/leaderboard/maintainers */
      if (method === 'GET' && url.pathname === '/api/leaderboard/maintainers') {
        return await handleLeaderboardMaintainers(env, url, request);
      }

      /* GET /api/leaderboard/tools */
      if (method === 'GET' && url.pathname === '/api/leaderboard/tools') {
        return await handleLeaderboardTools(env, url, request);
      }

      /* GET /leaderboard-refresh — manual sync trigger (rate-limited) */
      if (method === 'GET' && url.pathname === '/leaderboard-refresh') {
        return await handleManualRefresh(env, request);
      }

      /* GET /api/admin/registrations — for Google Sheets sync */
      if (method === 'GET' && url.pathname === '/api/admin/registrations') {
        const secret = request.headers.get('X-Admin-Secret');
        const envSecret = env.ADMIN_SECRET || '';
        if (!secret || !envSecret || secret !== envSecret) {
          return jsonErr('Unauthorised', 401, request);
        }
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

      /* 404 for everything else */
      return secHeaders(new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }));

    } catch (err) {
      /* Top-level catch — never expose internals */
      console.error('Unhandled Worker error:', err?.message);
      return jsonErr('An unexpected error occurred. Please try again.', 500);
    }
  },

  /* ─── CRON — every 4 hours ──────────────────────────────────── */
  async scheduled(_event, env, _ctx) {
    console.log('Starting scheduled GitHub sync…');
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')").run();
      const result = await runSync(env);
      console.log('Sync result:', JSON.stringify(result));
    } catch (err) {
      console.error('Scheduled sync failed:', err?.message);
      try { await env.DB.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '0')").run(); } catch {}
    }
  },
};

/* ─── REGISTER HANDLER ───────────────────────────────────────── */
async function handleRegister(request, env) {
  const req = request;
  /* 1. CSRF */
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, req);

  /* 2. Rate limit */
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  /* 3. Parse body */
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  /* 4. Validate every field */
  const nameRes  = vName(body.name);
  if (!nameRes.ok) return jsonErr(nameRes.error, 400, request);

  const emailRes = vEmail(body.email);
  if (!emailRes.ok) return jsonErr(emailRes.error, 400, request);

  const ghRes = vGitHub(body.github);
  if (!ghRes.ok) return jsonErr(ghRes.error, 400, request);

  const roleRes = vRole(body.role);
  if (!roleRes.ok) return jsonErr(roleRes.error);

  /* 5. Explicit duplicate check — return friendly message */
  const isDuplicate = await isEmailRegistered(env, emailRes.val);
  if (isDuplicate) {
    return jsonOk({ message: 'You\'re already registered. We\'ll be in touch!' }, request);
  }

  /* 6. Write to D1 */
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO registrations (name, email, github, role, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(
        nameRes.val,
        emailRes.val,
        ghRes.val,
        roleRes.val,
        await hashString(ip),
        new Date().toISOString(),
      ).run();
    } catch (err) {
      console.error('DB error (register):', err?.message);
      if (err?.message?.includes('UNIQUE') || err?.message?.includes('constraint')) {
        return jsonOk({ message: 'You\'re already registered. We\'ll be in touch!' }, request);
      }
      return jsonErr('Registration failed — please try again.', 500, request);
    }
  }

  return jsonOk({ message: 'Registered successfully. We\'ll be in touch!' }, request);
}

/* ─── APPLY HANDLER ──────────────────────────────────────────── */
async function handleApply(request, env) {
  /* 1. CSRF */
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403);

  /* 2. Rate limit */
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rl = await checkRateLimit(env, ip);
  if (!rl.allowed) return jsonErr('Too many requests — please wait a minute and try again.', 429, request);

  /* 3. Parse body */
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;

  /* 4. Validate every field individually with clear errors */
  const nameRes  = vName(body.name);
  if (!nameRes.ok) return jsonErr(nameRes.error, 400, request);

  const emailRes = vEmail(body.email);
  if (!emailRes.ok) return jsonErr(emailRes.error, 400, request);

  const ghRes = vGitHub(body.github);
  if (!ghRes.ok) return jsonErr(ghRes.error, 400, request);

  const orgRes = vText(body.org, MAX.org, 'Organisation');
  if (!orgRes.ok) return jsonErr(orgRes.error);

  const whyRes = vText(body.why, MAX.why, 'Message');
  if (!whyRes.ok) return jsonErr(whyRes.error);

  /* Role is required for applications (unlike registration) */
  const roleRes = vRole(body.role);
  if (!roleRes.ok || !roleRes.val) return jsonErr('Please select a role to apply for', 400, request);

  /* 5. Explicit duplicate check — friendly message, no info leak */
  const isDuplicate = await isAlreadyApplied(env, emailRes.val, roleRes.val);
  if (isDuplicate) {
    return jsonOk({ message: 'You\'ve already applied for this role. We\'ll review it soon!' }, request);
  }

  /* 6. Write to D1 */
  if (env.DB) {
    try {
      await env.DB.prepare(
        `INSERT INTO applications (email, name, github, org, why, role, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        emailRes.val,
        nameRes.val,
        ghRes.val,
        orgRes.val,
        whyRes.val,
        roleRes.val,
        await hashString(ip),
        new Date().toISOString(),
      ).run();
    } catch (err) {
      console.error('DB error (apply):', err?.message);
      // Handle race-condition duplicate
      if (err?.message?.includes('UNIQUE') || err?.message?.includes('constraint')) {
        return jsonOk({ message: 'You\'ve already applied for this role. We\'ll review it soon!' }, request);
      }
      return jsonErr('Application failed — please try again.', 500, request);
    }
  }

  return jsonOk({ message: 'Application received! We\'ll be in touch when the project launches.' }, request);
}

/* ═══════════════════════════════════════════════════════════════
   LEADERBOARD API HANDLERS
   ═══════════════════════════════════════════════════════════════ */

const LB_CACHE_HEADERS = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' };

function lbJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: LB_CACHE_HEADERS });
}

function parseLbQuery(url) {
  const sort = url.searchParams.get('sort') ?? '';
  const dir  = url.searchParams.get('dir') === 'asc' ? 'ASC' : 'DESC';
  const q    = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  return { sort, dir, q };
}

/* GET /api/leaderboard/meta */
async function handleLeaderboardMeta(env) {
  if (!env.DB) return lbJson({ last_synced_at: null, sync_running: false });
  try {
    const row     = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'last_synced_at'").first();
    const running = await env.DB.prepare("SELECT value FROM sync_state WHERE key = 'sync_running'").first();
    return lbJson({ last_synced_at: row?.value ?? null, sync_running: running?.value === '1' });
  } catch { return lbJson({ last_synced_at: null, sync_running: false }); }
}

/* GET /api/leaderboard/repos */
async function handleLeaderboardRepos(env, url) {
  if (!env.DB) return lbJson([]);
  const { sort, dir, q } = parseLbQuery(url);
  const VALID = new Set(['name','language','open_prs','stars']);
  const sortCol = VALID.has(sort) ? sort : 'open_prs';
  try {
    const rows = await env.DB.prepare(`
      SELECT r.id, r.name, r.full_name, r.description, r.language,
             r.open_prs, r.stars, r.upstream_url, r.synced_at,
             COUNT(DISTINCT p.id)                 AS total_prs,
             COUNT(DISTINCT pp.login)              AS contributors,
             COALESCE(SUM(p.consensus_accept),0)  AS total_accept,
             COALESCE(SUM(p.consensus_modify),0)  AS total_modify,
             COALESCE(SUM(p.consensus_reject),0)  AS total_reject
      FROM repos r
      LEFT JOIN pull_requests p ON p.repo_name = r.name
      LEFT JOIN pr_participants pp ON pp.repo_name = r.name
      GROUP BY r.id
      ORDER BY ${sortCol} ${dir}
    `).all();
    let results = rows.results ?? [];
    if (q) results = results.filter(r =>
      String(r.name ?? '').toLowerCase().includes(q) ||
      String(r.language ?? '').toLowerCase().includes(q) ||
      String(r.description ?? '').toLowerCase().includes(q)
    );
    return lbJson(results);
  } catch (err) { console.error('lb repos:', err?.message); return lbJson([]); }
}

/* GET /api/leaderboard/prs */
async function handleLeaderboardPRs(env, url) {
  if (!env.DB) return lbJson([]);
  const { sort, dir, q } = parseLbQuery(url);
  const VALID = new Set(['repo_name','number','title','state','comment_count','participants',
    'consensus_accept','consensus_modify','consensus_reject','updated_at']);
  const sortCol = VALID.has(sort) ? sort : 'updated_at';
  try {
    const rows = await env.DB.prepare(`
      SELECT id, repo_name, number, title, state, author, html_url,
             comment_count, participants,
             consensus_accept, consensus_modify, consensus_reject,
             merged_upstream, merged_at, created_at, updated_at
      FROM pull_requests
      ORDER BY ${sortCol} ${dir}
      LIMIT 500
    `).all();
    let results = rows.results ?? [];
    if (q) results = results.filter(r =>
      String(r.repo_name ?? '').toLowerCase().includes(q) ||
      String(r.title ?? '').toLowerCase().includes(q) ||
      String(r.author ?? '').toLowerCase().includes(q)
    );
    return lbJson(results);
  } catch (err) { console.error('lb prs:', err?.message); return lbJson([]); }
}

/* GET /api/leaderboard/contributors */
async function handleLeaderboardContributors(env, url) {
  if (!env.DB) return lbJson([]);
  const { sort, dir, q } = parseLbQuery(url);
  const VALID = new Set(['login','prs_worked','total_interactions','reactions_received',
    'accepts','modifies','rejects','reputation','avg_per_pr']);
  const sortCol = VALID.has(sort) ? sort : 'reputation';
  try {
    const rows = await env.DB.prepare(`
      SELECT c.login, c.avatar_url, c.prs_worked,
             c.total_interactions,
             COALESCE(c.reactions_received,0) AS reactions_received,
             c.accepts, c.modifies, c.rejects,
             ROUND(c.total_interactions + COALESCE(c.reactions_received,0) * 0.25, 2) AS reputation,
             CASE WHEN c.prs_worked > 0
               THEN ROUND(CAST(c.total_interactions AS REAL) / c.prs_worked, 2)
               ELSE 0 END AS avg_per_pr
      FROM contributors c
      ORDER BY ${sortCol} ${dir}
    `).all();
    let results = rows.results ?? [];
    if (q) results = results.filter(r => String(r.login ?? '').toLowerCase().includes(q));
    return lbJson(results);
  } catch (err) { console.error('lb contributors:', err?.message); return lbJson([]); }
}

/* GET /api/leaderboard/maintainers */
async function handleLeaderboardMaintainers(env, url) {
  if (!env.DB) return lbJson([]);
  const { sort, dir, q } = parseLbQuery(url);
  const VALID = new Set(['repo_name','total_submitted','total_merged','merge_rate']);
  const sortCol = VALID.has(sort) ? sort : 'merge_rate';
  try {
    const rows = await env.DB.prepare(`
      SELECT p.repo_name, r.upstream_url,
             COUNT(*)  AS total_submitted,
             SUM(p.merged_upstream) AS total_merged,
             CASE WHEN COUNT(*) > 0
               THEN ROUND(CAST(SUM(p.merged_upstream) AS REAL) / COUNT(*) * 100, 1)
               ELSE 0 END AS merge_rate,
             SUM(p.consensus_accept) AS total_accept_consensus
      FROM pull_requests p
      JOIN repos r ON r.name = p.repo_name
      GROUP BY p.repo_name
      ORDER BY ${sortCol} ${dir}
    `).all();
    let results = rows.results ?? [];
    if (q) results = results.filter(r => String(r.repo_name ?? '').toLowerCase().includes(q));
    return lbJson(results);
  } catch (err) { console.error('lb maintainers:', err?.message); return lbJson([]); }
}

/* GET /api/leaderboard/tools */
async function handleLeaderboardTools(env, url) {
  if (!env.DB) return lbJson([]);
  const { q } = parseLbQuery(url);

  const BOT_TO_TOOL = {
    'appsecai-app[bot]': 'AppSecAI',
    'appsecai-bot':      'AppSecAI',
    'dryrun-bot':        'DryRun Security',
    'dryrun-security':   'DryRun Security',
  };

  try {
    // Fix tools
    const fixRows = await env.DB.prepare(`
      SELECT author, COUNT(*) AS total_prs,
             SUM(merged_upstream) AS accepted_upstream,
             COUNT(DISTINCT repo_name) AS projects_worked,
             SUM(comment_count) AS total_comments,
             SUM(consensus_accept) AS total_accept,
             SUM(consensus_modify) AS total_modify,
             SUM(consensus_reject) AS total_reject
      FROM pull_requests
      WHERE author IS NOT NULL
      GROUP BY author
      ORDER BY total_prs DESC
    `).all();

    const fixToolMap = new Map();
    for (const r of (fixRows.results ?? [])) {
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
          login: r.author, name: toolName,
          total_prs: r.total_prs,
          accepted_upstream: r.accepted_upstream ?? 0,
          projects_worked:   r.projects_worked ?? 0,
          interactions:      r.total_comments ?? 0,
          total_accept:      r.total_accept ?? 0,
          total_modify:      r.total_modify ?? 0,
          total_reject:      r.total_reject ?? 0,
        });
      }
    }

    // Detection tools
    const detectRows = await env.DB.prepare(`
      SELECT detection_tool,
             COUNT(*) AS vulnerabilities,
             COUNT(DISTINCT repo_name) AS projects_worked,
             SUM(merged_upstream) AS accepted_upstream,
             SUM(consensus_accept) AS total_accept,
             SUM(consensus_modify) AS total_modify,
             SUM(consensus_reject) AS total_reject
      FROM pull_requests
      WHERE detection_tool IS NOT NULL
      GROUP BY detection_tool
      ORDER BY vulnerabilities DESC
    `).all();

    const tools = [];
    for (const [name, fix] of fixToolMap.entries()) {
      tools.push({ name, role: 'fix', login: fix.login,
        total_prs: fix.total_prs, vulnerabilities: fix.total_prs,
        accepted_upstream: fix.accepted_upstream, projects_worked: fix.projects_worked,
        interactions: fix.interactions,
        total_accept: fix.total_accept, total_modify: fix.total_modify, total_reject: fix.total_reject });
    }
    for (const d of (detectRows.results ?? [])) {
      tools.push({ name: d.detection_tool, role: 'detect', login: null,
        total_prs: null, vulnerabilities: d.vulnerabilities,
        accepted_upstream: d.accepted_upstream ?? 0, projects_worked: d.projects_worked,
        interactions: null,
        total_accept: d.total_accept ?? 0, total_modify: d.total_modify ?? 0, total_reject: d.total_reject ?? 0 });
    }

    let results = tools;
    if (q) results = results.filter(r => String(r.name ?? '').toLowerCase().includes(q));
    return lbJson(results);
  } catch (err) { console.error('lb tools:', err?.message); return lbJson([]); }
}

/* ─── Manual sync trigger ──────────────────────────────────────── */
async function handleManualRefresh(env, request) {
  if (!env.DB) return jsonErr('Database not available', 503, request);
  try {
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
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('Manual refresh error:', err?.message);
    return jsonErr('Sync failed', 500, request);
  }
}

/* ═══════════════════════════════════════════════════════════════
   GITHUB SYNC ENGINE
   ═══════════════════════════════════════════════════════════════ */

const GITHUB_ORG  = 'owasp-oasis';
const META_REPOS  = new Set(['project-overview', 'project-planning', 'project-website']);

async function ghFetch(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'oasis-worker-sync/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${path} → ${res.status}`);
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

/* Parse OASIS vote comments */
function parseDecision(body) {
  const lower = (body || '').toLowerCase();
  const isValidation = lower.includes('validation summary:');
  const isRejection  = lower.includes('rejection summary:');
  if (!isValidation && !isRejection) return null;
  if (isRejection && lower.includes('reject')) return 'reject';
  if (isValidation) {
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

/* Parse detection tool from PR body */
function parseDetectionTool(body) {
  if (!body) return null;
  // 1. Explicit Detected By field
  const m = body.match(/\*\*[Dd]etected\s+[Bb]y[:\*]+\*?\*?\s*([^\n*|]+)/);
  if (m) {
    const raw = m[1].trim().toLowerCase();
    if (raw.includes('appsec') || raw.includes('fenix')) return 'AppSecAI';
    if (raw.includes('opengrep')) return 'OpenGrep';
    if (raw.includes('semgrep')) return 'Semgrep OSS';
    return m[1].trim().substring(0, 60) || 'SAST (unknown)';
  }
  // 2. AppSecAI markers
  if (/appsecai-diff-hash/i.test(body)) return 'AppSecAI';
  if (/AppSecAI Vulnerability ID/i.test(body)) return 'AppSecAI';
  if (/Detected\s+[Bb]y[:\s]+AppSec\s*AI/i.test(body)) return 'AppSecAI';
  // 3. Tool names in body
  if (/Semgrep\s+OSS/i.test(body)) return 'Semgrep OSS';
  if (/OpenGrep/i.test(body)) return 'OpenGrep';
  if (/\b(javascript|python|java|go|ruby)\.[a-z]+\.[a-z]+\.[a-z]/.test(body)) return 'Semgrep OSS';
  // 4. Generic SAST header
  if (/##\s+What\s+SAST\s+Found/i.test(body)) return 'SAST (unknown)';
  return null;
}

async function rebuildContributors(db, syncStart) {
  const rows = await db.prepare(`
    SELECT login,
           COUNT(DISTINCT pr_id) AS prs_worked,
           SUM(interactions) AS total_interactions,
           SUM(reactions_received) AS reactions_received,
           SUM(CASE WHEN decision = 'accept' THEN 1 ELSE 0 END) AS accepts,
           SUM(CASE WHEN decision = 'modify' THEN 1 ELSE 0 END) AS modifies,
           SUM(CASE WHEN decision = 'reject' THEN 1 ELSE 0 END) AS rejects
    FROM pr_participants
    GROUP BY login
  `).all();

  for (const row of (rows.results ?? [])) {
    const existing = await db.prepare('SELECT avatar_url FROM contributors WHERE login = ?').bind(row.login).first();
    await db.prepare(`
      INSERT OR REPLACE INTO contributors
        (login, avatar_url, prs_worked, total_interactions, reactions_received,
         accepts, modifies, rejects, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.login,
      existing?.avatar_url ?? `https://github.com/${row.login}.png?size=64`,
      row.prs_worked,
      row.total_interactions,
      row.reactions_received ?? 0,
      row.accepts,
      row.modifies,
      row.rejects,
      syncStart,
    ).run();
  }
}

async function runSync(env) {
  const { DB: db, GITHUB_TOKEN: token } = env;
  const stats = { repos: 0, prs: 0, comments: 0, contributors: 0 };

  if (!token) return { ok: false, message: 'GITHUB_TOKEN not configured', stats };

  try {
    // Sync state
    const sinceRow = await db.prepare("SELECT value FROM sync_state WHERE key = 'last_synced_at'").first();
    const since    = sinceRow?.value ?? '2020-01-01T00:00:00Z';
    const syncStart = new Date().toISOString();

    // 1. Fetch all fork repos
    const repos = await ghFetchAll(`/orgs/${GITHUB_ORG}/repos?type=public`, token);

    for (const repo of repos) {
      if (!repo.fork || META_REPOS.has(repo.name)) continue;

      // Full repo details for upstream URL
      let detail;
      try { detail = await ghFetch(`/repos/${GITHUB_ORG}/${repo.name}`, token); } catch { detail = repo; }
      const upstreamUrl = detail.parent?.html_url ?? null;

      // Count open PRs from DB (will be updated after PR sync)
      const openCount0 = await db.prepare(
        "SELECT COUNT(*) as c FROM pull_requests WHERE repo_name = ? AND state = 'open'"
      ).bind(repo.name).first();

      await db.prepare(`
        INSERT OR REPLACE INTO repos (id, name, full_name, description, language, open_prs, stars, upstream_url, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(repo.id, repo.name, repo.full_name, repo.description ?? null,
               repo.language ?? null, openCount0?.c ?? 0, repo.stargazers_count,
               upstreamUrl, syncStart).run();
      stats.repos++;

      // 2. Fetch PRs updated since last sync
      const openPRs   = await ghFetchAll(`/repos/${GITHUB_ORG}/${repo.name}/pulls?state=open&sort=updated&direction=desc`, token);
      const closedPRs = await ghFetchAll(`/repos/${GITHUB_ORG}/${repo.name}/pulls?state=closed&sort=updated&direction=desc`, token);
      const prs = [...openPRs, ...closedPRs].filter(pr => pr.updated_at >= since);

      for (const pr of prs) {
        stats.prs++;
        const participantMap = new Map();
        const ensureP = login => {
          if (!participantMap.has(login)) participantMap.set(login, { interactions: 0, decision: null, reactions_received: 0 });
          return participantMap.get(login);
        };

        // 3. Fetch comments
        let comments = [];
        try { comments = await ghFetchAll(`/repos/${GITHUB_ORG}/${repo.name}/issues/${pr.number}/comments`, token); } catch {}
        stats.comments += comments.length;

        let consensusAccept = 0, consensusModify = 0, consensusReject = 0;
        for (const comment of comments) {
          const login = comment.user?.login;
          if (!login || login.endsWith('[bot]')) continue;
          const p = ensureP(login);
          p.interactions++;
          const decision = parseDecision(comment.body);
          if (decision) {
            p.decision = decision;
            if (decision === 'accept') consensusAccept++;
            if (decision === 'modify') consensusModify++;
            if (decision === 'reject') consensusReject++;
          }
          // 4. Reactions
          try {
            const reactions = await ghFetchAll(`/repos/${GITHUB_ORG}/${repo.name}/issues/comments/${comment.id}/reactions`, token);
            for (const rxn of reactions) {
              const rLogin = rxn.user?.login;
              if (!rLogin || rLogin === login || rLogin.endsWith('[bot]')) continue;
              p.reactions_received++;
              if (rxn.content === '+1' && decision) {
                if (decision === 'accept') consensusAccept++;
                if (decision === 'modify') consensusModify++;
                if (decision === 'reject') consensusReject++;
              }
              ensureP(rLogin).interactions++;
            }
          } catch {}
        }

        // 5. Detection tool
        const detectionTool = parseDetectionTool(pr.body);

        // 6. Preserve existing merged_upstream flag
        const existingRow = await db.prepare(
          'SELECT merged_upstream FROM pull_requests WHERE repo_name = ? AND number = ?'
        ).bind(repo.name, pr.number).first();
        const mergedUpstream = existingRow?.merged_upstream ?? 0;
        const state = pr.state === 'open' ? 'open' : 'closed';

        // 7. Upsert PR
        await db.prepare(`
          INSERT OR REPLACE INTO pull_requests
            (id, repo_name, number, title, state, author, html_url, comment_count,
             participants, consensus_accept, consensus_modify, consensus_reject,
             merged_upstream, head_sha, merged_at, created_at, updated_at,
             detection_tool, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          pr.id, repo.name, pr.number, pr.title, state,
          pr.user?.login ?? null, pr.html_url, comments.length, participantMap.size,
          consensusAccept, consensusModify, consensusReject, mergedUpstream,
          pr.head?.sha ?? null, pr.merged_at ?? null, pr.created_at, pr.updated_at,
          detectionTool ?? null, syncStart,
        ).run();

        // 8. Upsert participants
        for (const [login, data] of participantMap.entries()) {
          await db.prepare(`
            INSERT OR REPLACE INTO pr_participants
              (pr_id, repo_name, pr_number, login, interactions, decision, reactions_received)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(pr.id, repo.name, pr.number, login, data.interactions, data.decision ?? null, data.reactions_received).run();
        }
      }

      // Update open_prs count post-sync
      const openCount = await db.prepare(
        "SELECT COUNT(*) as c FROM pull_requests WHERE repo_name = ? AND state = 'open'"
      ).bind(repo.name).first();
      await db.prepare('UPDATE repos SET open_prs = ?, synced_at = ? WHERE name = ?')
        .bind(openCount?.c ?? 0, syncStart, repo.name).run();
    }

    // 9. Rebuild contributors
    await rebuildContributors(db, syncStart);
    const contribCount = await db.prepare('SELECT COUNT(*) as c FROM contributors').first();
    stats.contributors = contribCount?.c ?? 0;

    // 10. Save timestamps
    await db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('last_synced_at', ?)").bind(syncStart).run();
    await db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '0')").run();

    return { ok: true, message: `Sync complete at ${syncStart}`, stats };
  } catch (err) {
    try { await db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '0')").run(); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg, stats };
  }
}
