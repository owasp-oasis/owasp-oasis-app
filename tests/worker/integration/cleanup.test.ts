import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { reconcileRemovedRepositories } from '../../../worker/cleanup.js';
import { fetchMock } from './fetchMock.js';
import { applySchema, cleanDB, insertTestPR, insertTestRepo } from './helpers.js';

describe('Repository reconciliation', () => {
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

  it('removes repos absent from GitHub even when they have no current PRs', async () => {
    await insertTestRepo(env, { name: 'current-fork' });
    await insertTestRepo(env, { name: 'stale-with-pr' });
    await insertTestRepo(env, { name: 'stale-without-pr' });
    await insertTestPR(env, { repo_name: 'stale-with-pr' });

    fetchMock.when(req => req.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=1'
    )).respondWith(Response.json([{ name: 'current-fork', fork: true }]));
    fetchMock.when(req => req.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=2'
    )).respondWith(Response.json([]));

    const result = await reconcileRemovedRepositories(env);

    expect(result).toMatchObject({ checked: 3, removed: 2, flagged: 1, errors: 0 });
    expect(result.repositories).toEqual([
      { repo: 'stale-with-pr', prs_flagged: 1 },
      { repo: 'stale-without-pr', prs_flagged: 0 },
    ]);

    const repos = await env.DB.prepare('SELECT name FROM repos ORDER BY name').all<{ name: string }>();
    expect(repos.results).toEqual([{ name: 'current-fork' }]);

    const stalePr = await env.DB.prepare(
      "SELECT deleted, deleted_at FROM pull_requests WHERE repo_name = 'stale-with-pr'",
    ).first<{ deleted: number; deleted_at: string | null }>();
    expect(stalePr?.deleted).toBe(1);
    expect(stalePr?.deleted_at).toBeTruthy();
  });
});
