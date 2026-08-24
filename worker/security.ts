/**
 * Security utilities: headers, CORS, CSRF, rate limiting, response helpers.
 */

import type { Env } from './types.js';

/* ─── CONFIG ─────────────────────────────────────────────────── */
const RATE_LIMIT_WINDOW_SEC = 60;
const RATE_LIMIT_MAX        = 5;
export const CSRF_COOKIE        = '__csrf';
export const CSRF_HEADER        = 'x-csrf-token';
export const SESSION_COOKIE     = '__session';
export const OAUTH_STATE_COOKIE = '__oauth_state';

/* ─── SECURITY HEADERS ───────────────────────────────────────── */
const SEC_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'",
    // TODO(F9): Replace 'unsafe-inline' in script-src with a nonce/hash approach (e.g. vite-plugin-csp).
    //           Fonts are now self-hosted so googleapis.com has been removed.
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
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
  // Changed from require-corp → credentialless (F10): require-corp blocked self-hosted fonts
  // from being loaded when cross-origin resources lacked CORP headers.
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

export const ALLOWED_ORIGINS = [
  'https://www.owasp-oasis.com',
  'https://owasp-oasis.com',
  'https://www.owasp-oasis.org',
  'https://owasp-oasis.org',
  'https://preview.owasp-oasis.org',
  'http://localhost:8787',
  'http://127.0.0.1:8787',
];

export const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'OPTIONS', 'HEAD']);

export function isLoopbackRequest(request: Request): boolean {
  const { hostname } = new URL(request.url);
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function secHeaders(res: Response, request?: Request): Response {
  const r = new Response(res.body, res);
  const isLoopback = request ? isLoopbackRequest(request) : false;
  for (const [k, v] of Object.entries(SEC_HEADERS)) {
    if (isLoopback && k === 'Strict-Transport-Security') continue;
    r.headers.set(k, v);
  }
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

export function constantTimeStringEqual(left: string, right: string): boolean {
  if (!left || !right) return false;
  const maxLength = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let index = 0; index < maxLength; index++) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export function isAdminRequest(request: Request, env: Pick<Env, 'ADMIN_SECRET'>): boolean {
  return constantTimeStringEqual(
    request.headers.get('X-Admin-Secret') ?? '',
    env.ADMIN_SECRET ?? '',
  );
}

/* ─── GITHUB TOKEN ENCRYPTION ───────────────────────────────── */
// AES-GCM using a 256-bit key derived from TOKEN_ENCRYPTION_KEY (env secret).
// The cookie value is base64url(iv [12 bytes] || ciphertext).

export const GH_TOKEN_COOKIE = '__gh_token';

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function encryptToken(secret: string, token: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  );
  // Concatenate iv + ciphertext then base64url-encode
  const combined = new Uint8Array(iv.byteLength + ct.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ct), iv.byteLength);
  return b64urlEncode(combined.buffer);
}

export async function decryptToken(secret: string, encoded: string): Promise<string | null> {
  try {
    const key  = await deriveKey(secret);
    const data = b64urlDecode(encoded);
    const iv   = data.slice(0, 12);
    const ct   = data.slice(12);
    const pt   = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return null; // decryption failure → treat as missing token
  }
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
