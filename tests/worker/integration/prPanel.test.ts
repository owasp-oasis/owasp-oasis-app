/**
 * Integration tests for PR panel endpoints.
 * Tests: /api/pr-panel/:id/details, /files, /comments, /react
 *
 * Coverage gaps (mock fetch limitation):
 * - Real GitHub API response formats
 * - GitHub rate limiting
 * - Real file diff rendering
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';
import {
  applySchema,
  cleanDB,
  makeCsrf,
  createTestSession,
  insertTestRepo,
  insertTestPR,
} from './helpers.js';

describe('PR Panel endpoints', () => {
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

  describe('GET /api/pr-panel/:id/details', () => {
    beforeEach(() => {
      fetchMock
        .when((req) => req.url.includes('/pulls/'))
        .respondWith(
          new Response(
            JSON.stringify({
              id: 1001,
              number: 1,
              title: 'CWE-89 (SQL Injection) High Severity in foo.py',
              state: 'open',
              body: 'Fix for SQL injection\n\n## TL;DR\nThis PR fixes SQL injection',
              html_url: 'https://github.com/test/repo/pull/1',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
    });

    it('returns parsed PR metadata', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/details'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.number).toBe(1);
      expect(body.title).toContain('SQL Injection');
    });

    it('parses CWE from PR title', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/details'),
      );

      const body = await res.json();
      expect(body.cwe_id).toBe('CWE-89');
      expect(body.cwe_desc).toBe('SQL Injection');
    });

    it('parses severity from PR title', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/details'),
      );

      const body = await res.json();
      expect(body.cvss_severity).toBe('high');
    });

    it('returns 404 for non-existent PR', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/99999/details'),
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/pr-panel/:id/files', () => {
    beforeEach(() => {
      fetchMock
        .when((req) => req.url.includes('/pulls/') && req.url.includes('/files'))
        .respondWith(
          new Response(
            JSON.stringify([
              {
                filename: 'src/foo.py',
                status: 'modified',
                additions: 10,
                deletions: 5,
                changes: 15,
                patch: '--- a/src/foo.py\n+++ b/src/foo.py\n@@ -1,3 +1,4 @@\n test',
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
    });

    it('returns file list', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/files'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.files)).toBe(true);
      expect(body.files[0].filename).toBe('src/foo.py');
    });

    it('returns file changes with additions/deletions', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/files'),
      );

      const body = await res.json();
      expect(body.files[0].additions).toBe(10);
      expect(body.files[0].deletions).toBe(5);
      expect(body.files[0].changes).toBe(15);
    });

    it('returns 404 for non-existent PR', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/99999/files'),
      );

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/pr-panel/:id/comments', () => {
    beforeEach(() => {
      fetchMock
        .when((req) => req.url.includes('/issues/') && req.url.includes('/comments'))
        .respondWith(
          new Response(
            JSON.stringify([
              {
                id: 123456,
                body: '## validation summary: This is valid\n\n| decision | accept |',
                user: { login: 'validator' },
                created_at: new Date().toISOString(),
              },
            ]),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
    });

    it('returns comments with parsed decisions', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/comments'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.comments)).toBe(true);
      expect(body.comments[0].oasis_decision).toBe('accept');
    });

    it('parses OASIS template comments', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/comments'),
      );

      const body = await res.json();
      expect(body.comments[0].body).toContain('validation summary');
    });

    it('returns 404 for non-existent PR', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/99999/comments'),
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/pr-panel/:id/react', () => {
    beforeEach(() => {
      fetchMock
        .when((req) => req.url.includes('/issues/comments/') && req.url.includes('/reactions'))
        .respondWith(
          new Response(
            JSON.stringify({
              id: 123456789,
              content: '+1',
              user: { login: 'test-user' },
            }),
            { headers: { 'Content-Type': 'application/json' } },
          ),
        );
    });

    it('requires authentication', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/react', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': 'a'.repeat(64),
            Cookie: `__csrf=${'a'.repeat(64)}`,
          },
          body: JSON.stringify({ comment_id: 123, reaction: '+1' }),
        }),
      );

      expect(res.status).toBe(401);
    });

    it('requires CSRF token', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);

      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/react', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({ comment_id: 123, reaction: '+1' }),
        }),
      );

      expect(res.status).toBe(403);
    });

    it('accepts valid reaction', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/react', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: `__csrf=${csrf}; ${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({ comment_id: 123456, reaction: '+1' }),
        }),
      );

      expect(res.status).toBe(200);
    });

    it('rejects invalid reaction type', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const csrf = makeCsrf();

      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(
        new Request('http://localhost/api/pr-panel/1001/react', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrf,
            Cookie: `__csrf=${csrf}; ${sessionCookie}; ${tokenCookie}`,
          },
          body: JSON.stringify({ comment_id: 123456, reaction: 'invalid' }),
        }),
      );

      expect(res.status).toBe(400);
    });

    it('allows valid GitHub reaction emoji', async () => {
      const { sessionCookie, tokenCookie } = await createTestSession(env);
      const validReactions = ['+1', '-1', 'laugh', 'confused', 'heart', 'hooray', 'rocket', 'eyes'];

      for (const [index, reaction] of validReactions.entries()) {
        const csrf = makeCsrf();
        const repoName = `reaction-repo-${index}`;
        const prId = 2000 + index;

        await insertTestRepo(env, { id: 100 + index, name: repoName });
        await insertTestPR(env, { id: prId, repo_name: repoName, number: index + 1 });

        const res = await SELF.fetch(
          new Request(`http://localhost/api/pr-panel/${prId}/react`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-csrf-token': csrf,
              Cookie: `__csrf=${csrf}; ${sessionCookie}; ${tokenCookie}`,
            },
            body: JSON.stringify({ comment_id: 123456, reaction }),
          }),
        );

        expect(res.status).not.toBe(400);
      }
    });
  });
});
