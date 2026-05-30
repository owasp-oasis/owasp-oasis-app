/**
 * GitHub OAuth handlers: login, callback, me, logout.
 *
 * Flow:
 *   GET /api/auth/login    → redirect to GitHub OAuth, set __oauth_state cookie
 *   GET /api/auth/callback → exchange code, create session, redirect to /leaderboards
 *   GET /api/auth/me       → return {user:{login,avatar_url}} or {user:null}
 *   POST /api/auth/logout  → delete session, clear cookie
 */

import type { Env } from '../types.js';
import {
  generateCSRF,
  getCookieValue,
  validateCSRF,
  jsonOk,
  jsonErr,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
} from '../security.js';

/* ─── CALLBACK URL ────────────────────────────────────────────── */
const CALLBACK_URL = 'https://preview.owasp-oasis.org/api/auth/callback';
const SESSION_TTL_DAYS = 30;

/* ─── SHARED: look up a valid session ────────────────────────── */
export interface SessionUser {
  session_id: string;
  github_login: string;
  avatar_url: string | null;
  github_token: string;
}

export async function getSession(_request: Request, env: Env, sessionId?: string): Promise<SessionUser | null> {
  const sid = sessionId ?? getCookieValue(_request, SESSION_COOKIE);
  if (!sid || !/^[0-9a-f]{64}$/.test(sid)) return null;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    'SELECT session_id, github_login, avatar_url, github_token FROM user_sessions WHERE session_id = ? AND expires_at > ?',
  ).bind(sid, now).first<SessionUser>();
  return row ?? null;
}

/* ─── GET /api/auth/login ─────────────────────────────────────── */
export async function handleLogin(_request: Request, env: Env): Promise<Response> {
  const state = generateCSRF(); // 32-byte hex = 64 chars
  const params = new URLSearchParams({
    client_id:    env.GITHUB_CLIENT_ID,
    redirect_uri: CALLBACK_URL,
    scope:        'public_repo write:discussion',
    state,
  });
  const githubUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

  // Use a new Response so we can add Set-Cookie (redirect Response is immutable)
  const r = new Response(null, {
    status:  302,
    headers: {
      Location:   githubUrl,
      'Set-Cookie': `${OAUTH_STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
  // Add security headers (minus COEP/COOP/CORP which break redirects in some browsers)
  r.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  return r;
}

/* ─── GET /api/auth/callback ─────────────────────────────────── */
export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url   = new URL(request.url);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Validate state (timing-safe comparison)
  const cookieState = getCookieValue(request, OAUTH_STATE_COOKIE);
  if (!code || !state || !cookieState) {
    return redirectWithError('/leaderboards', 'OAuth state missing');
  }
  if (!timingSafeEqual(state, cookieState)) {
    return redirectWithError('/leaderboards', 'OAuth state mismatch');
  }

  // Exchange code for access token
  let accessToken: string;
  try {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept:         'application/json',
        'Content-Type': 'application/json',
        'User-Agent':   'oasis-worker-auth/1.0',
      },
      body: JSON.stringify({
        client_id:     env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  CALLBACK_URL,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return redirectWithError('/leaderboards', tokenData.error ?? 'Token exchange failed');
    }
    accessToken = tokenData.access_token;
  } catch {
    return redirectWithError('/leaderboards', 'Token exchange error');
  }

  // Fetch GitHub user info
  let login: string, avatarUrl: string;
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/vnd.github+json',
        'User-Agent':  'oasis-worker-auth/1.0',
      },
    });
    const user = await userRes.json() as { login?: string; avatar_url?: string };
    if (!user.login) return redirectWithError('/leaderboards', 'Could not fetch GitHub user');
    login     = user.login;
    avatarUrl = user.avatar_url ?? `https://github.com/${user.login}.png?size=64`;
  } catch {
    return redirectWithError('/leaderboards', 'GitHub user fetch error');
  }

  // Create session in D1
  const sessionId = generateCSRF(); // 64-char hex
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO user_sessions (session_id, github_login, avatar_url, github_token, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(sessionId, login, avatarUrl, accessToken, now.toISOString(), expires.toISOString()).run();
  } catch {
    return redirectWithError('/leaderboards', 'Session creation failed');
  }

  // Redirect to leaderboards with session cookie set.
  // IMPORTANT: Set-Cookie must be separate headers — joining with ', ' breaks cookie parsing.
  // Use Headers.append() to emit two distinct Set-Cookie headers.
  const callbackHeaders = new Headers({
    Location: '/leaderboards',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  });
  callbackHeaders.append('Set-Cookie', `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  callbackHeaders.append('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`);
  return new Response(null, { status: 302, headers: callbackHeaders });
}

/* ─── GET /api/auth/me ───────────────────────────────────────── */
export async function handleMe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) {
    return jsonOk({ user: null }, request);
  }
  return jsonOk({
    user: {
      login:      session.github_login,
      avatar_url: session.avatar_url,
    },
  }, request);
}

/* ─── POST /api/auth/logout ──────────────────────────────────── */
export async function handleLogout(request: Request, env: Env): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);

  const sessionId = getCookieValue(request, SESSION_COOKIE);
  if (sessionId) {
    try {
      await env.DB.prepare('DELETE FROM user_sessions WHERE session_id = ?').bind(sessionId).run();
    } catch { /* non-fatal */ }
  }

  const r = jsonOk({ message: 'Logged out' }, request);
  r.headers.set(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
  return r;
}

/* ─── HELPERS ─────────────────────────────────────────────────── */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function redirectWithError(path: string, _error: string): Response {
  // In production log or pass error via URL param for debugging; for now just redirect
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${path}?auth_error=1`,
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    },
  });
}
