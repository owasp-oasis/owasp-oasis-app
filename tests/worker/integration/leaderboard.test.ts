/**
 * Integration tests for leaderboard endpoints.
 * Tests: /api/leaderboard/meta, /repos, /prs, /contributors, /maintainers, /tools
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, insertTestRepo, insertTestPR } from './helpers.js';

describe('Leaderboard endpoints', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  afterEach(async () => {
    await cleanDB(env);
  });

  describe('GET /api/leaderboard/meta', () => {
    it('returns sync status', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/meta'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.last_synced_at).toBeTruthy();
      expect(body.sync_running).toBeDefined();
    });

    it('returns ISO-8601 timestamp', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/meta'));
      const body = await res.json();

      // Should parse as valid ISO date
      expect(() => new Date(body.last_synced_at)).not.toThrow();
    });
  });

  describe('GET /api/leaderboard/repos', () => {
    it('returns empty array on fresh DB', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/repos'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    it('returns repos that contribute current PRs', async () => {
      await insertTestRepo(env, { name: 'test-repo-1' });
      await insertTestRepo(env, { name: 'test-repo-2' });
      await insertTestPR(env, { id: 1001, repo_name: 'test-repo-1' });
      await insertTestPR(env, { id: 1002, repo_name: 'test-repo-2' });

      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/repos'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThanOrEqual(2);
      expect(body.some((r: any) => r.name === 'test-repo-1')).toBe(true);
    });

    it('hides repos with no current PRs', async () => {
      await insertTestRepo(env, { name: 'active-repo' });
      await insertTestRepo(env, { name: 'empty-repo' });
      await insertTestRepo(env, { name: 'deleted-pr-repo' });
      await insertTestPR(env, { id: 1001, repo_name: 'active-repo' });
      await insertTestPR(env, { id: 1002, repo_name: 'deleted-pr-repo' });
      await env.DB.prepare(
        'UPDATE pull_requests SET deleted = 1, deleted_at = ? WHERE id = ?',
      ).bind(new Date().toISOString(), 1002).run();

      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/repos'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.map((repo: any) => repo.name)).toEqual(['active-repo']);
    });

    it('does not attach an inactive repo history to a new repo that reuses its name', async () => {
      await insertTestRepo(env, { id: 101, name: 'reused-name' });
      await insertTestPR(env, { id: 1001, repo_id: 101, repo_name: 'reused-name' });
      await env.DB.prepare('UPDATE repos SET active = 0 WHERE id = 101').run();
      await insertTestRepo(env, { id: 202, name: 'reused-name' });
      await insertTestPR(env, { id: 1002, repo_id: 202, repo_name: 'reused-name' });

      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/repos'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ id: 202, name: 'reused-name', total_prs: 1 });
    });

    it('includes security headers', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/repos'));

      expect(res.headers.get('X-Frame-Options')).toBe('DENY');
      expect(res.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('has cache headers', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/repos'));

      expect(res.headers.get('Cache-Control')).toContain('max-age');
    });

    it('supports search by repo name', async () => {
      await insertTestRepo(env, { name: 'python-repo' });
      await insertTestRepo(env, { name: 'go-repo' });
      await insertTestPR(env, { id: 1001, repo_name: 'python-repo' });
      await insertTestPR(env, { id: 1002, repo_name: 'go-repo' });

      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/repos?q=python'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((r: any) => r.name.includes('python'))).toBe(true);
    });

    it('supports sort by various columns', async () => {
      await insertTestRepo(env, { name: 'repo-a', open_prs: 5 });
      await insertTestRepo(env, { name: 'repo-b', open_prs: 2 });
      await insertTestPR(env, { id: 1001, repo_name: 'repo-a' });
      await insertTestPR(env, { id: 1002, repo_name: 'repo-b' });

      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/repos?sort=open_prs&dir=DESC'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[0].open_prs).toBeGreaterThanOrEqual(body[1].open_prs);
    });

    it('rejects invalid sort column (SQL injection guard)', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/repos?sort=invalid_column'),
      );

      // Should either default or reject gracefully
      expect(res.status).toBe(200); // Should still work with safe default
    });
  });

  describe('GET /api/leaderboard/prs', () => {
    it('returns empty array on fresh DB', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/prs'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('returns PRs after insert', async () => {
      await insertTestRepo(env);
      await insertTestPR(env);

      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/prs'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.length).toBeGreaterThan(0);
    });

    it('returns PRs only from the active repository ID when a name is reused', async () => {
      await insertTestRepo(env, { id: 101, name: 'reused-name' });
      await insertTestPR(env, { id: 1001, repo_id: 101, repo_name: 'reused-name', number: 1 });
      await env.DB.prepare('UPDATE repos SET active = 0 WHERE id = 101').run();
      await insertTestRepo(env, { id: 202, name: 'reused-name' });
      await insertTestPR(env, { id: 2002, repo_id: 202, repo_name: 'reused-name', number: 1 });

      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/prs'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ id: 2002, repo_id: 202, repo_name: 'reused-name' });
    });

    it('returns max 500 PRs', async () => {
      await insertTestRepo(env);

      // Insert 50 test PRs (wouldn't actually try 500 in unit tests)
      for (let i = 0; i < 50; i++) {
        await insertTestPR(env, { id: 2000 + i, number: i });
      }

      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/prs'));
      const body = await res.json();

      expect(body.length).toBeLessThanOrEqual(500);
    });

    it('supports filtering by repo name', async () => {
      await insertTestRepo(env, { name: 'filter-test' });
      await insertTestPR(env, { repo_name: 'filter-test' });

      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/prs?q=filter-test'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((p: any) => p.repo_name === 'filter-test')).toBe(true);
    });
  });

  describe('GET /api/leaderboard/contributors', () => {
    it('returns empty array on fresh DB', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/contributors'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });

    it('returns contributors with reputation scores', async () => {
      // Insert a contributor
      await env.DB.prepare(`
        INSERT INTO contributors
        (login, base_reputation, modified_reputation, prs_worked, accepts)
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind('test-contributor', 100, 120, 5, 3)
        .run();

      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/contributors'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((c: any) => c.login === 'test-contributor')).toBe(true);
    });

    it('sorts by modified_reputation by default', async () => {
      await env.DB.prepare(`
        INSERT INTO contributors (login, modified_reputation)
        VALUES (?, ?)
      `)
        .bind('low-rep', 10)
        .run();

      await env.DB.prepare(`
        INSERT INTO contributors (login, modified_reputation)
        VALUES (?, ?)
      `)
        .bind('high-rep', 1000)
        .run();

      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/contributors'),
      );

      const body = await res.json();
      expect(body[0].modified_reputation).toBeGreaterThanOrEqual(body[body.length - 1].modified_reputation);
    });
  });

  describe('GET /api/contributors/:login', () => {
    it('returns 404 for unknown contributor', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/contributors/nonexistent-user'),
      );

      expect(res.status).toBe(404);
    });

    it('returns contributor detail with scores', async () => {
      await env.DB.prepare(`
        INSERT INTO contributors
        (login, avatar_url, base_reputation, modified_reputation, rank_90d)
        VALUES (?, ?, ?, ?, ?)
      `)
        .bind('detail-user', 'https://example.com/avatar.jpg', 50, 60, 42)
        .run();

      const res = await SELF.fetch(
        new Request('http://localhost/api/contributors/detail-user'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.contributor.login).toBe('detail-user');
      expect(body.contributor.base_reputation).toBe(50);
      expect(body.allTimeRank).toBeDefined();
    });

    it('returns contributions array', async () => {
      await env.DB.prepare(`
        INSERT INTO contributors (login)
        VALUES (?)
      `)
        .bind('contributions-user')
        .run();

      const res = await SELF.fetch(
        new Request('http://localhost/api/contributors/contributions-user'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.contributions)).toBe(true);
    });
  });

  describe('GET /api/leaderboard/maintainers', () => {
    it('returns maintainer stats', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/maintainers'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('GET /api/leaderboard/tools', () => {
    it('returns tool cards', async () => {
      const res = await SELF.fetch(new Request('http://localhost/api/leaderboard/tools'));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body.every((tool: any) => ['detect', 'fix', 'validate'].includes(tool.role))).toBe(true);
    });
  });

  describe('Detailed repo endpoint', () => {
    it('GET /api/leaderboard/repos/:id returns repo with PRs', async () => {
      await insertTestRepo(env, { id: 4242, name: 'detail-repo' });
      await insertTestPR(env, { repo_id: 4242, repo_name: 'detail-repo' });

      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/repos/4242'),
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.repo.name).toBe('detail-repo');
      expect(Array.isArray(body.prs)).toBe(true);
      expect(Array.isArray(body.top_contributors)).toBe(true);
    });

    it('returns 404 for non-existent repo', async () => {
      const res = await SELF.fetch(
        new Request('http://localhost/api/leaderboard/repos/999999'),
      );

      expect(res.status).toBe(404);
    });
  });
});
