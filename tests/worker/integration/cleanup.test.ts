import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  reconcileRemovedRepositories,
  reconcileRepositoryPullRequests,
} from '../../../worker/cleanup.js';
import { upsertRepo } from '../../../worker/db.js';
import {
  failOrphanCleanupDispatch,
  ORPHAN_CLEANUP_CHUNK_SIZE,
  processOrphanCleanupChunk,
  seedOrphanCleanupWorkItems,
} from '../../../worker/orphanCleanupWorkflow.js';
import { startSyncJob } from '../../../worker/syncJobs.js';
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

describe('Bounded orphan cleanup', () => {
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

  it('processes a large snapshot in independent slices below the subrequest ceiling', async () => {
    await insertTestRepo(env, { id: 101, name: 'large-fork' });
    for (let number = 1; number <= 85; number += 1) {
      await insertTestPR(env, {
        id: 10_000 + number,
        repo_id: 101,
        repo_name: 'large-fork',
        number,
      });
    }

    for (const number of [20, 40, 60, 80]) {
      fetchMock.when(request => request.url === (
        `https://api.github.com/repos/owasp-oasis/large-fork/pulls/${number}`
      )).respondWith(new Response(null, { status: 404 }));
    }
    fetchMock.when(request => request.url.startsWith(
      'https://api.github.com/repos/owasp-oasis/large-fork/pulls/',
    )).respondWith(Response.json({ state: 'open' }));

    const runId = await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', trigger: 'manual', mode: 'live', status: 'queued',
    });
    expect(await seedOrphanCleanupWorkItems(env.DB, runId, runId)).toBe(85);

    const first = await processOrphanCleanupChunk(env, runId);
    const second = await processOrphanCleanupChunk(env, runId);
    const third = await processOrphanCleanupChunk(env, runId);

    expect(ORPHAN_CLEANUP_CHUNK_SIZE).toBe(40);
    expect(first).toEqual({ checked: 40, flagged: 2, errors: 0, remaining: 45, terminal: false });
    expect(second).toEqual({ checked: 40, flagged: 2, errors: 0, remaining: 5, terminal: false });
    expect(third).toEqual({ checked: 5, flagged: 0, errors: 0, remaining: 0, terminal: false });

    const run = await env.DB.prepare(`
      SELECT expected_items, completed_items, failed_items, metrics_json
        FROM sync_job_runs WHERE id = ?
    `).bind(runId).first<{
      expected_items: number;
      completed_items: number;
      failed_items: number;
      metrics_json: string;
    }>();
    expect(run).toMatchObject({ expected_items: 85, completed_items: 85, failed_items: 0 });
    expect(JSON.parse(run?.metrics_json ?? '{}')).toMatchObject({
      chunk_size: 40, checked: 85, flagged: 4, errors: 0, remaining: 0,
    });

    const deleted = await env.DB.prepare(
      'SELECT number FROM pull_requests WHERE deleted = 1 ORDER BY number',
    ).all<{ number: number }>();
    expect(deleted.results).toEqual([{ number: 20 }, { number: 40 }, { number: 60 }, { number: 80 }]);
  });

  it('stops a slice after an authentication rejection and preserves unattempted work', async () => {
    await insertTestRepo(env, { id: 202, name: 'auth-fork' });
    for (let number = 1; number <= 45; number += 1) {
      await insertTestPR(env, {
        id: 20_000 + number,
        repo_id: 202,
        repo_name: 'auth-fork',
        number,
      });
    }
    fetchMock.when(request => request.url.startsWith(
      'https://api.github.com/repos/owasp-oasis/auth-fork/pulls/',
    )).respondWith(new Response(null, { status: 401 }));

    const runId = await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', trigger: 'scheduled', mode: 'legacy', status: 'queued',
    });
    await seedOrphanCleanupWorkItems(env.DB, runId, runId);

    const result = await processOrphanCleanupChunk(env, runId);

    expect(result).toEqual({ checked: 1, flagged: 0, errors: 1, remaining: 44, terminal: true });
    const statuses = await env.DB.prepare(`
      SELECT status, COUNT(*) AS count FROM sync_work_items
       WHERE job_run_id = ? GROUP BY status ORDER BY status
    `).bind(runId).all<{ status: string; count: number }>();
    expect(statuses.results).toEqual([
      { status: 'deferred', count: 44 },
      { status: 'failed', count: 1 },
    ]);
  });

  it('fails the legacy parent when the cleanup Workflow cannot be dispatched', async () => {
    const pipelineRunId = crypto.randomUUID();
    const parentRunId = await startSyncJob(env.DB, {
      jobKey: 'legacy_workspace_sync', pipelineRunId, trigger: 'scheduled', mode: 'legacy',
    });
    await env.DB.prepare(
      'UPDATE sync_job_runs SET metrics_json = ? WHERE id = ?',
    ).bind(JSON.stringify({ repository_errors: 0, sync_errors: 0, cleanup_pending: true }), parentRunId).run();
    const cleanupRunId = await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', pipelineRunId, trigger: 'scheduled', mode: 'legacy', status: 'queued',
    });

    await failOrphanCleanupDispatch(env, {
      jobRunId: cleanupRunId,
      pipelineRunId,
      legacyParentRunId: parentRunId,
    }, new Error('Workflow binding unavailable'));

    const runs = await env.DB.prepare(`
      SELECT job_key, status, error_code, metrics_json FROM sync_job_runs
       WHERE id IN (?, ?) ORDER BY job_key
    `).bind(parentRunId, cleanupRunId).all<{
      job_key: string;
      status: string;
      error_code: string;
      metrics_json: string;
    }>();
    expect(runs.results?.map(run => ({
      job_key: run.job_key,
      status: run.status,
      error_code: run.error_code,
      metrics: JSON.parse(run.metrics_json),
    }))).toEqual([
      {
        job_key: 'legacy_workspace_sync',
        status: 'failed',
        error_code: 'legacy_pipeline_incomplete',
        metrics: expect.objectContaining({ cleanup_pending: false, cleanup_errors: 1 }),
      },
      {
        job_key: 'orphan_cleanup',
        status: 'failed',
        error_code: 'orphan_cleanup_workflow_failed',
        metrics: expect.objectContaining({ bounded_workflow: true, errors: 1 }),
      },
    ]);
  });
});
