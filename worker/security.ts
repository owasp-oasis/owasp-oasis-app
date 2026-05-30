/**
 * Security utilities: headers, CORS, CSRF, rate limiting, response helpers.
 */

import type { Env } from './types.js';

/* ─── CONFIG ─────────────────────────────────────────────────── */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX        = 5;
export const CSRF_COOKIE    = '__csrf';
export const CSRF_HEADER    = 'x-csrf-token';

/* ─── SECURITY HEADERS ───────────────────────────────────────── */
const SEC_HEADERS: Record<string, string> = {
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

export const ALLOWED_ORIGINS = [
  'https://www.owasp-oasis.com',
  'https://owasp-oasis.com',
  'https://www.owasp-oasis.org',
  'https://owasp-oasis.org',
  'https://preview.owasp-oasis.bluejar.org',
];

export const ALLOWED_METHODS = new Set(['GET', 'POST', 'OPTIONS', 'HEAD']);

export function secHeaders(res: Response, request?: Request): Response {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(SEC_HEADERS)) r.headers.set(k, v);
  if (request) {
    const origin = request.headers.get('Origin') ?? '';
    if (ALLOWED_ORIGINS.includes(origin)) {
      r.headers.set('Access-Control-Allow-Origin', origin);
      r.headers.set('Access-Control-Allow-Credentials', 'true');
    }
  }
  return r;
}

/* ─── RESPONSE HELPERS ───────────────────────────────────────── */
export function jsonOk(
  data: Record<string, unknown>,
  req?: Request,
  opts?: { cache?: string },
): Response {
  const res = Response.json({ ok: true, ...data }, { status: 200 });
  const r = secHeaders(res, req);
  if (opts?.cache) r.headers.set('Cache-Control', opts.cache);
  return r;
}

export function jsonErr(msg: string, status = 400, req?: Request): Response {
  return secHeaders(Response.json({ ok: false, error: msg }, { status }), req);
}

/* ─── CORS PREFLIGHT ─────────────────────────────────────────── */
export function handleOptions(request: Request): Response {
  const origin = request.headers.get('Origin') ?? '';
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
export function generateCSRF(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function getCookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  const match  = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

export function validateCSRF(request: Request): boolean {
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
import { hashString } from './validation.js';

export async function checkRateLimit(env: Env, ip: string): Promise<{ allowed: boolean }> {
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
