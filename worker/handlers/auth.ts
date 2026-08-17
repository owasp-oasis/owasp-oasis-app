/**
 * GitHub OAuth handlers: login, callback, me, logout.
 *
 * Flow:
 *   GET /api/auth/login    → redirect to GitHub OAuth, set __oauth_state cookie
 *   GET /api/auth/callback → exchange code, create session, redirect to the Workspace
 *   GET /api/auth/me       → return {user:{login,avatar_url}} or {user:null}
 *   POST /api/auth/logout  → delete session, clear cookie
 */

import type { Env } from '../types.js';
import {
  generateCSRF,
  getCookieValue,
  validateCSRF,
  encryptToken,
  decryptToken,
  jsonOk,
  jsonErr,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  GH_TOKEN_COOKIE,
} from '../security.js';

const SESSION_TTL_DAYS = 7;

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

  // Fetch session metadata from D1 (no token stored there)
  const row = await env.DB.prepare(
    'SELECT session_id, github_login, avatar_url FROM user_sessions WHERE session_id = ? AND expires_at > ?',
  ).bind(sid, now).first<Omit<SessionUser, 'github_token'>>();
  if (!row) return null;

  // Decrypt GitHub token from the encrypted HttpOnly cookie
  const encryptedToken = getCookieValue(_request, GH_TOKEN_COOKIE);
  const github_token = encryptedToken
    ? await decryptToken(env.TOKEN_ENCRYPTION_KEY, encryptedToken)
    : null;

  return { ...row, github_token: github_token ?? '' };
}

/* ─── GET /api/auth/login ─────────────────────────────────────── */
export async function handleLogin(_request: Request, env: Env): Promise<Response> {
  const state = generateCSRF(); // 32-byte hex = 64 chars
  const params = new URLSearchParams({
    client_id:    env.GITHUB_CLIENT_ID,
    redirect_uri: env.OAUTH_CALLBACK_URL,
    // TODO(security): public_repo grants write access to all public repos the user can access.
    // GitHub does not offer a narrower scope for issue comment reactions on public repos.
    // write:discussion was removed — it is for GitHub Discussions, not PR/issue comment reactions.
    // user:email is needed to fetch the user's primary verified email for mailing list registration.
    scope:        'public_repo user:email',
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
    return redirectWithError('/workspace/pull-requests', 'OAuth state missing');
  }
  if (!timingSafeEqual(state, cookieState)) {
    return redirectWithError('/workspace/pull-requests', 'OAuth state mismatch');
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
        redirect_uri:  env.OAUTH_CALLBACK_URL,
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) {
      return redirectWithError('/workspace/pull-requests', tokenData.error ?? 'Token exchange failed');
    }
    accessToken = tokenData.access_token;
  } catch {
    return redirectWithError('/workspace/pull-requests', 'Token exchange error');
  }

  // Fetch GitHub user info
  let login: string, avatarUrl: string, email: string = '';
  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/vnd.github+json',
        'User-Agent':  'oasis-worker-auth/1.0',
      },
    });
    const user = await userRes.json() as { login?: string; avatar_url?: string };
    if (!user.login) return redirectWithError('/workspace/pull-requests', 'Could not fetch GitHub user');
    login     = user.login;
    avatarUrl = user.avatar_url ?? `https://github.com/${user.login}.png?size=64`;
  } catch {
    return redirectWithError('/workspace/pull-requests', 'GitHub user fetch error');
  }

  // Fetch user emails to get primary verified email for mailing list registration
  try {
    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/vnd.github+json',
        'User-Agent':  'oasis-worker-auth/1.0',
      },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json() as Array<{ email?: string; primary?: boolean; verified?: boolean }>;
      // Prefer primary + verified, then verified, then any
      const primary = emails.find((e) => e.primary && e.verified);
      const verified = emails.find((e) => e.verified);
      const any = emails[0];
      email = primary?.email ?? verified?.email ?? any?.email ?? '';
    }
  } catch {
    // Email fetch failed — continue without it (not fatal)
  }

  // Create session in D1 (token is NOT stored in the database)
  const sessionId = generateCSRF(); // 64-char hex
  const now = new Date();
  const ttlSeconds = SESSION_TTL_DAYS * 24 * 60 * 60;
  const expires = new Date(now.getTime() + ttlSeconds * 1000);

  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO user_sessions (session_id, github_login, avatar_url, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(sessionId, login, avatarUrl, now.toISOString(), expires.toISOString()).run();
  } catch {
    return redirectWithError('/workspace/pull-requests', 'Session creation failed');
  }

  // Auto-register the user as a validator in the registrations table (if not already registered)
  try {
    // INSERT OR IGNORE if email is unique — don't overwrite form-registered users
    if (email) {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO registrations (name, email, github, role, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(login, email, login, 'validator', 'oauth', now.toISOString()).run();
    } else {
      // If no email, insert with empty email and rely on github column for upgrade
      await env.DB.prepare(
        `INSERT OR IGNORE INTO registrations (name, email, github, role, ip_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(login, '', login, 'validator', 'oauth', now.toISOString()).run();
    }

    // Upgrade existing registrations: if the user already has a row (matched by github handle)
    // and their role is empty or 'general' (interested), upgrade to 'validator'
    await env.DB.prepare(
      `UPDATE registrations SET role = 'validator', updated_at = ? WHERE github = ? AND role IN ('', 'general')`,
    ).bind(now.toISOString(), login).run();
  } catch {
    // Registration upsert failed — not fatal, continue with session creation
    console.error('Failed to upsert registration during OAuth');
  }

  // Encrypt the OAuth token for storage in a separate HttpOnly cookie.
  // The token never touches the database.
  let encryptedToken: string;
  try {
    encryptedToken = await encryptToken(env.TOKEN_ENCRYPTION_KEY, accessToken);
  } catch {
    return redirectWithError('/workspace/pull-requests', 'Token encryption failed');
  }

  // Redirect to the Workspace with session and token cookies set.
  // IMPORTANT: Set-Cookie must be separate headers — joining with ', ' breaks cookie parsing.
  const callbackHeaders = new Headers({
    Location: '/workspace/pull-requests',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  });
  callbackHeaders.append('Set-Cookie', `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  callbackHeaders.append('Set-Cookie', `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttlSeconds}`);
  callbackHeaders.append('Set-Cookie', `${GH_TOKEN_COOKIE}=${encryptedToken}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttlSeconds}`);
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
  r.headers.set('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
  r.headers.append('Set-Cookie', `${GH_TOKEN_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
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

function redirectWithError(path: string, error: string): Response {
  console.error('[auth] redirectWithError:', error);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${path}?auth_error=1`,
      'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
    },
  });
}
