/**
 * OWASP OASIS — Cloudflare Worker
 * Full security hardening — every input exception + duplicate handled
 */

import HTML from './index.html';

/* ─── CONFIG ─────────────────────────────────────────────────── */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX        = 5;
const CSRF_COOKIE           = '__csrf';
const CSRF_HEADER           = 'x-csrf-token';
const MAX_BODY_BYTES        = 8_192; // 8KB max request body — prevents DoS via large payloads

/* ─── ALLOWED VALUES (whitelist approach) ────────────────────── */
const ALLOWED_ROLES         = new Set(['validator', 'general', '']);
const ALLOWED_METHODS       = new Set(['GET', 'POST', 'OPTIONS', 'HEAD']);

/* ─── SECURITY HEADERS ───────────────────────────────────────── */
const SEC_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: https://www.appsecai.io https://cdn.prod.website-files.com",
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

    /* HTTPS enforcement — skip on localhost */
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
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
