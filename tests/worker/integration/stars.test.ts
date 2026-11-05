/**
 * Integration tests for the repository star prompt endpoints.
 *   GET  /api/github/stars
 *   POST /api/github/stars
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, makeCsrf, createTestSession } from './helpers.js';

const STARRED_URL = 'https://api.github.com/user/starred/';

/**
 * Unstarred-by-default GitHub mock. Routes are first-match-wins, so register
 * any "already starred" (204) GET routes before calling this. Returns the list
 * of repositories PUT to /user/starred.
 */
function mockStarred(putStatus = 204) {
  const puts: string[] = [];
  fetchMock
    .when(req => req.method === 'GET' && req.url.startsWith(STARRED_URL))
    .respondWith(new Response(null, { status: 404 }));
  fetchMock
    .when(req => {
      if (req.method !== 'PUT' || !req.url.startsWith(STARRED_URL)) return false;
      puts.push(req.url.slice(STARRED_URL.length));
      return true;
    })
    .respondWith(new Response(null, { status: putStatus }));
  return puts;
}

describe('Repository star endpoints', () => {
  beforeAll(async () => { await applySchema(env); });
  beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
  afterEach(async () => { fetchMock.deactivate(); await cleanDB(env); });

  describe('GET /api/github/stars', () => {
    it('requires authentication', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/github/stars'));
      expect(res.status).toBe(401);
    });

    it('reports per-repository star state', async () => {
      fetchMock
        .when(req => req.method === 'GET' && req.url === `${STARRED_URL}OWASP/oasis`)
        .respondWith(new Response(null, { status: 204 }));
      mockStarred();
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      const res = await SELF.fetch(new Request('http://localhost/api/github/stars', {
        headers: { Cookie: `${sessionCookie}; ${tokenCookie}` },
      }));

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        all_starred: false,
        repos: [
          { full_name: 'OWASP/oasis', starred: true },
          { full_name: 'owasp-oasis/project-overview', starred: false },
        ],
      });
    });

    it('returns 502 when GitHub state cannot be read', async () => {
      fetchMock
        .when(req => req.url.startsWith(STARRED_URL))
        .respondWith(new Response('rate limited', { status: 403 }));
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const res = await SELF.fetch(new Request('http://localhost/api/github/stars', {
        headers: { Cookie: `${sessionCookie}; ${tokenCookie}` },
      }));
      expect(res.status).toBe(502);
    });
  });

  describe('POST /api/github/stars', () => {
    it('requires CSRF token', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const res = await SELF.fetch(new Request('http://localhost/api/github/stars', {
        method: 'POST',
        headers: { Cookie: `${sessionCookie}; ${tokenCookie}` },
      }));
      expect(res.status).toBe(403);
    });

    it('requires authentication', async () => {
      const csrf = makeCsrf();
      const res = await SELF.fetch(new Request('http://localhost/api/github/stars', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf, Cookie: `__csrf=${csrf}` },
      }));
      expect(res.status).toBe(401);
    });

    it('stars only the unstarred configured repositories and ignores the request body', async () => {
      fetchMock
        .when(req => req.method === 'GET' && req.url === `${STARRED_URL}OWASP/oasis`)
        .respondWith(new Response(null, { status: 204 }));
      const puts = mockStarred();
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      const res = await SELF.fetch(new Request('http://localhost/api/github/stars', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrf,
          Cookie: `__csrf=${csrf}; ${sessionCookie}; ${tokenCookie}`,
        },
        body: JSON.stringify({ repos: ['attacker/repo'] }),
      }));

      expect(res.status).toBe(200);
      expect(puts).toEqual(['owasp-oasis/project-overview']);
      await expect(res.json()).resolves.toMatchObject({ ok: true, all_starred: true });
    });

    it('reports failure when GitHub rejects the star', async () => {
      mockStarred(404);
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      const res = await SELF.fetch(new Request('http://localhost/api/github/stars', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf, Cookie: `__csrf=${csrf}; ${sessionCookie}; ${tokenCookie}` },
      }));

      expect(res.status).toBe(502);
      await expect(res.json()).resolves.toMatchObject({ ok: false, all_starred: false });
    });
  });
});
