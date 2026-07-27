/**
 * Integration tests for OAuth authentication flow.
 * Covers: login, callback, session management, logout.
 *
 * GitHub API mocking: fetchMock from cloudflare:test intercepts all outbound fetch calls.
 *
 * Coverage gaps (mock fetch limitation):
 * - Real GitHub OAuth token generation/validation
 * - GitHub OAuth rate limiting (429 from GitHub)
 * - Real GitHub API format changes
 * - Network failures to GitHub
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from 'cloudflare:test';
import { applySchema, cleanDB, makeCsrf } from './helpers.js';

describe('Authentication (OAuth)', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  describe('GET /api/auth/login', () => {
    it('redirects to GitHub OAuth URL', async () => {
      const res = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));

      expect(res.status).toBe(302);
      const location = res.headers.get('Location');
      expect(location).toContain('github.com/login/oauth/authorize');
      expect(location).toContain('client_id=test-client-id');
      expect(location).toContain('scope=public_repo');
    });

    it('sets __oauth_state cookie', async () => {
      const res = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));

      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('__oauth_state=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Max-Age=600');
    });

    it('includes state parameter in redirect URL', async () => {
      const res = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));

      const location = res.headers.get('Location');
      expect(location).toContain('state=');
    });
  });

  describe('GET /api/auth/callback', () => {
    beforeEach(() => {
      // Mock GitHub OAuth token exchange
      fetchMock.when((req) => req.url === 'https://github.com/login/oauth/access_token').respondWith(
        new Response(
          JSON.stringify({
            access_token: 'test-access-token',
            token_type: 'bearer',
            scope: 'public_repo',
          }),
          {
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      // Mock GitHub user API
      fetchMock
        .when((req) => req.url === 'https://api.github.com/user')
        .respondWith(
          new Response(
            JSON.stringify({
              login: 'test-user',
              avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );

      // Mock GitHub user emails API
      fetchMock
        .when((req) => req.url === 'https://api.github.com/user/emails')
        .respondWith(
          new Response(
            JSON.stringify([
              {
                email: 'test@oasis-test.internal',
                primary: true,
                verified: true,
              },
            ]),
            {
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
    });

    it('completes full OAuth callback flow', async () => {
      // Step 1: Get state from login
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const stateMatch = loginCookie?.match(/__oauth_state=([a-f0-9]+)/);
      const state = stateMatch?.[1] ?? '';

      // Step 2: Callback with code and state
      const callbackRes = await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?code=test-code&state=${state}`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get('Location')).toBe('/leaderboards');
    });

    it('creates user_sessions row', async () => {
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const stateMatch = loginCookie?.match(/__oauth_state=([a-f0-9]+)/);
      const state = stateMatch?.[1] ?? '';

      await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?code=test-code&state=${state}`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      // Verify session was created in DB
      const sessions = await env.DB.prepare('SELECT * FROM user_sessions WHERE github_login = ?')
        .bind('test-user')
        .all();
      expect(sessions.results).toHaveLength(1);
      expect((sessions.results[0] as any).github_login).toBe('test-user');
    });

    it('creates registrations row with validator role', async () => {
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const stateMatch = loginCookie?.match(/__oauth_state=([a-f0-9]+)/);
      const state = stateMatch?.[1] ?? '';

      await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?code=test-code&state=${state}`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      // Verify registration was created
      const regs = await env.DB.prepare('SELECT * FROM registrations WHERE email = ?')
        .bind('test@oasis-test.internal')
        .all();
      expect(regs.results.length).toBeGreaterThan(0);
      expect((regs.results[0] as any).role).toBe('validator');
    });

    it('sets __session and __gh_token cookies', async () => {
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const stateMatch = loginCookie?.match(/__oauth_state=([a-f0-9]+)/);
      const state = stateMatch?.[1] ?? '';

      const callbackRes = await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?code=test-code&state=${state}`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      const setCookies = callbackRes.headers.getSetCookie?.() ?? [];
      expect(setCookies.some((c) => c.includes('__session='))).toBe(true);
      expect(setCookies.some((c) => c.includes('__gh_token='))).toBe(true);
    });

    it('rejects callback with bad state', async () => {
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');

      const callbackRes = await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?code=test-code&state=wrong-state`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get('Location')).toContain('error=');
    });

    it('rejects callback without code', async () => {
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const stateMatch = loginCookie?.match(/__oauth_state=([a-f0-9]+)/);
      const state = stateMatch?.[1] ?? '';

      const callbackRes = await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?state=${state}`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get('Location')).toContain('error=');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns {user: null} when unauthenticated', async () => {
      const res = await env.SELF.fetch(new Request('http://localhost/api/auth/me'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toBeNull();
    });

    it('returns user data when authenticated', async () => {
      fetchMock.when((req) => req.url === 'https://github.com/login/oauth/access_token').respondWith(
        new Response(
          JSON.stringify({
            access_token: 'test-token',
          }),
        ),
      );
      fetchMock
        .when((req) => req.url === 'https://api.github.com/user')
        .respondWith(
          new Response(
            JSON.stringify({
              login: 'authenticated-user',
              avatar_url: 'https://avatars.githubusercontent.com/u/2?v=4',
            }),
          ),
        );
      fetchMock
        .when((req) => req.url === 'https://api.github.com/user/emails')
        .respondWith(
          new Response(
            JSON.stringify([
              {
                email: 'auth@oasis-test.internal',
                primary: true,
                verified: true,
              },
            ]),
          ),
        );

      // Login and get session
      const loginRes = await env.SELF.fetch(new Request('http://localhost/api/auth/login'));
      const loginCookie = loginRes.headers.get('Set-Cookie');
      const stateMatch = loginCookie?.match(/__oauth_state=([a-f0-9]+)/);
      const state = stateMatch?.[1] ?? '';

      const callbackRes = await env.SELF.fetch(
        new Request(`http://localhost/api/auth/callback?code=test-code&state=${state}`, {
          redirect: 'manual',
          headers: { Cookie: loginCookie ?? '' },
        }),
      );

      const callbackCookies = callbackRes.headers.getSetCookie?.() ?? [];
      const sessionCookie = callbackCookies.find((c) => c.includes('__session='));

      // Now call /me with the session cookie
      const meRes = await env.SELF.fetch(
        new Request('http://localhost/api/auth/me', {
          headers: { Cookie: sessionCookie ?? '' },
        }),
      );

      expect(meRes.status).toBe(200);
      const body = await meRes.json();
      expect(body.user).not.toBeNull();
      expect(body.user.login).toBe('authenticated-user');
      expect(body.user.avatar_url).toBeTruthy();
    });

    it('returns null user when session is expired', async () => {
      // Create an expired session in DB
      const now = new Date().toISOString();
      const expired = new Date(Date.now() - 1000).toISOString(); // 1 second ago

      await env.DB.prepare(`
        INSERT INTO user_sessions (session_id, github_login, avatar_url, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind('expired-session-id', 'test-user', null, now, expired)
        .run();

      const res = await env.SELF.fetch(
        new Request('http://localhost/api/auth/me', {
          headers: { Cookie: '__session=expired-session-id' },
        }),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.user).toBeNull();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('requires valid CSRF token', async () => {
      const res = await env.SELF.fetch(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: '{}',
        }),
      );

      expect(res.status).toBe(403);
    });

    it('deletes session from DB', async () => {
      // Create a test session
      const sessionId = 'test-session-to-delete';
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      await env.DB.prepare(`
        INSERT INTO user_sessions (session_id, github_login, avatar_url, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind(sessionId, 'test-user', null, now, expires)
        .run();

      // Get CSRF for logout
      const csrfRes = await env.SELF.fetch(new Request('http://localhost/api/csrf'));
      const csrfData = await csrfRes.json();
      const csrf = csrfData.csrf;
      const csrfCookie = csrfRes.headers.get('Set-Cookie');

      // Logout
      const logoutRes = await env.SELF.fetch(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: `${csrfCookie?.split(';')[0]}; __session=${sessionId}`,
          },
          body: '{}',
        }),
      );

      expect(logoutRes.status).toBe(200);

      // Verify session was deleted
      const sessions = await env.DB.prepare('SELECT * FROM user_sessions WHERE session_id = ?')
        .bind(sessionId)
        .all();
      expect(sessions.results).toHaveLength(0);
    });

    it('clears session cookie', async () => {
      // Get CSRF
      const csrfRes = await env.SELF.fetch(new Request('http://localhost/api/csrf'));
      const csrfData = await csrfRes.json();
      const csrf = csrfData.csrf;
      const csrfCookie = csrfRes.headers.get('Set-Cookie');

      // Logout
      const logoutRes = await env.SELF.fetch(
        new Request('http://localhost/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: csrfCookie ?? '',
          },
          body: '{}',
        }),
      );

      const setCookies = logoutRes.headers.getSetCookie?.() ?? [];
      expect(setCookies.some((c) => c.includes('__session=') && c.includes('Max-Age=0'))).toBe(true);
    });
  });
});
