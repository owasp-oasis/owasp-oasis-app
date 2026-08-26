import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  reconcileRemovedRepositories,
  reconcileRepositoryPullRequests,
} from '../../../worker/cleanup.js';
import { upsertRepo } from '../../../worker/db.js';
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

  it('deactivates repo IDs absent from GitHub even when they have no current PRs', async () => {
    await insertTestRepo(env, { id: 101, name: 'current-fork' });
    await insertTestRepo(env, { id: 202, name: 'stale-with-pr' });
    await insertTestRepo(env, { id: 303, name: 'stale-without-pr' });
    await insertTestPR(env, { repo_id: 202, repo_name: 'stale-with-pr' });

    fetchMock.when(req => req.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=1'
    )).respondWith(Response.json([{ id: 101, name: 'current-fork', fork: true }]));
    fetchMock.when(req => req.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=2'
    )).respondWith(Response.json([]));

    const result = await reconcileRemovedRepositories(env);

    expect(result).toMatchObject({ checked: 3, removed: 2, flagged: 1, errors: 0 });
    expect(result.repositories).toEqual([
      { repo_id: 202, repo: 'stale-with-pr', prs_flagged: 1 },
      { repo_id: 303, repo: 'stale-without-pr', prs_flagged: 0 },
    ]);

    const repos = await env.DB.prepare(
      'SELECT id, name, active FROM repos ORDER BY id',
    ).all<{ id: number; name: string; active: number }>();
    expect(repos.results).toEqual([
      { id: 101, name: 'current-fork', active: 1 },
      { id: 202, name: 'stale-with-pr', active: 0 },
      { id: 303, name: 'stale-without-pr', active: 0 },
    ]);

    const stalePr = await env.DB.prepare(
      "SELECT deleted, deleted_at FROM pull_requests WHERE repo_name = 'stale-with-pr'",
    ).first<{ deleted: number; deleted_at: string | null }>();
    expect(stalePr?.deleted).toBe(1);
    expect(stalePr?.deleted_at).toBeTruthy();
  });

  it('preserves an old repo when a different GitHub ID reuses its name', async () => {
    await insertTestRepo(env, { id: 101, name: 'reused-name' });
    await insertTestPR(env, { id: 1001, repo_id: 101, repo_name: 'reused-name', number: 1 });

    await upsertRepo(env.DB, {
      id: 202,
      name: 'reused-name',
      full_name: 'owasp-oasis/reused-name',
      description: 'New fork source',
      language: 'TypeScript',
      stargazers_count: 0,
    }, 'https://github.com/different/upstream', new Date().toISOString());
    await insertTestPR(env, { id: 2002, repo_id: 202, repo_name: 'reused-name', number: 1 });

    const repos = await env.DB.prepare(
      'SELECT id, active FROM repos WHERE name = ? ORDER BY id',
    ).bind('reused-name').all<{ id: number; active: number }>();
    expect(repos.results).toEqual([
      { id: 101, active: 0 },
      { id: 202, active: 1 },
    ]);

    const prs = await env.DB.prepare(
      'SELECT id, repo_id, number, deleted FROM pull_requests ORDER BY id',
    ).all<{ id: number; repo_id: number; number: number; deleted: number }>();
    expect(prs.results).toEqual([
      { id: 1001, repo_id: 101, number: 1, deleted: 1 },
      { id: 2002, repo_id: 202, number: 1, deleted: 0 },
    ]);

    await upsertRepo(env.DB, {
      id: 202,
      name: 'renamed-fork',
      full_name: 'owasp-oasis/renamed-fork',
      description: 'New fork source',
      language: 'TypeScript',
      stargazers_count: 0,
    }, 'https://github.com/different/upstream', new Date().toISOString());

    const renamedPr = await env.DB.prepare(
      'SELECT repo_id, repo_name FROM pull_requests WHERE id = 2002',
    ).first<{ repo_id: number; repo_name: string }>();
    expect(renamedPr).toEqual({ repo_id: 202, repo_name: 'renamed-fork' });
  });
});

describe('Pull request inventory reconciliation', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  afterEach(async () => {
    await cleanDB(env);
  });

  it('flags only PR IDs absent from a complete repository inventory', async () => {
    await insertTestRepo(env, { id: 101, name: 'current-fork' });
    await insertTestPR(env, { id: 1001, repo_id: 101, repo_name: 'current-fork', number: 1 });
    await insertTestPR(env, { id: 1002, repo_id: 101, repo_name: 'current-fork', number: 2 });

    const result = await reconcileRepositoryPullRequests(env.DB, 101, [1002, 1003]);

    expect(result).toEqual({ checked: 2, flagged: 1 });
    const rows = await env.DB.prepare(
      'SELECT id, deleted FROM pull_requests WHERE repo_id = ? ORDER BY id',
    ).bind(101).all<{ id: number; deleted: number }>();
    expect(rows.results).toEqual([
      { id: 1001, deleted: 1 },
      { id: 1002, deleted: 0 },
    ]);
  });

  it('uses immutable repository identity when PR numbers overlap', async () => {
    await insertTestRepo(env, { id: 101, name: 'same-name' });
    await insertTestRepo(env, { id: 202, name: 'same-name-later' });
    await insertTestPR(env, { id: 1001, repo_id: 101, repo_name: 'same-name', number: 1 });
    await insertTestPR(env, { id: 2001, repo_id: 202, repo_name: 'same-name-later', number: 1 });

    await reconcileRepositoryPullRequests(env.DB, 202, []);

    const rows = await env.DB.prepare(
      'SELECT id, deleted FROM pull_requests ORDER BY id',
    ).all<{ id: number; deleted: number }>();
    expect(rows.results).toEqual([
      { id: 1001, deleted: 0 },
      { id: 2001, deleted: 1 },
    ]);
  });
});
