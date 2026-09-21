import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB } from './helpers.js';
import {
  finishSyncJob,
  aggregateSyncJobStatuses,
  getSyncStatus,
  getOrStartSyncJob,
  pruneSyncJobHistory,
  recordDailyBudget,
  recordSyncJobEvent,
  resumeSyncJob,
  startSyncJob,
} from '../../../worker/syncJobs.js';
import type { Env } from '../../../worker/types.js';

describe('public sync status', () => {
  beforeAll(async () => applySchema(env));
  afterEach(async () => cleanDB(env));

  it('returns canonical health, registered jobs, and short cache headers', async () => {
    const response = await SELF.fetch(new Request('http://localhost/api/sync/status'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('max-age=15');
    const body = await response.json<Record<string, unknown>>() as {
      observability_ready: boolean;
      overall: { last_success_at: string };
      canonical: { schedule_enabled: boolean; phase: string; lock: null };
      jobs: Array<{ key: string }>;
    };
    expect(body.observability_ready).toBe(true);
    expect(body.overall.last_success_at).toBe('2020-01-01T00:00:00Z');
    expect(body.canonical).toEqual(expect.objectContaining({
      schedule_enabled: true,
      phase: 'idle',
      lock: null,
    }));
    expect(body.jobs.some(job => job.key === 'canonical_workspace_sync')).toBe(true);
    expect(body.jobs.some(job => job.key === 'repository_inventory')).toBe(true);
    expect(body.jobs.some(job => job.key === 'hubspot_contacts')).toBe(true);
    const productionStatus = await getSyncStatus({ ...env, ENVIRONMENT: 'production' } as Env) as {
      jobs: Array<{ key: string; retryable: boolean }>;
    };
    const executableJobs = productionStatus.jobs;
    expect(executableJobs.length).toBeGreaterThan(0);
    expect(executableJobs.every(job => job.retryable)).toBe(true);
  });

  it('derives the primary status from every child in the latest Workspace pipeline', async () => {
    expect(aggregateSyncJobStatuses(['queued', 'queued'])).toBe('queued');
    expect(aggregateSyncJobStatuses(['succeeded', 'queued'])).toBe('running');
    expect(aggregateSyncJobStatuses(['succeeded', 'failed'])).toBe('failed');
    expect(aggregateSyncJobStatuses(['succeeded', 'succeeded'])).toBe('succeeded');

    const pipelineRunId = crypto.randomUUID();
    await startSyncJob(env.DB, {
      jobKey: 'canonical_workspace_sync', pipelineRunId, trigger: 'manual', mode: 'live',
    });
    const childJobKeys = [
      'repository_inventory',
      'pull_request_catalog',
      'upstream_merge_status',
      'pull_request_comments',
      'comment_reactions',
      'vote_projection',
      'duplicate_resolution',
      'contributor_scores',
      'orphan_cleanup',
    ];
    const childIds: string[] = [];
    for (const jobKey of childJobKeys) {
      childIds.push(await startSyncJob(env.DB, {
        jobKey, pipelineRunId, trigger: 'continuation', mode: 'live', status: 'queued',
      }));
    }

    const readOverallStatus = async (): Promise<string> => {
      const status = await getSyncStatus(env) as { overall: { status: string } };
      return status.overall.status;
    };
    await expect(readOverallStatus()).resolves.toBe('queued');

    await env.DB.prepare("UPDATE sync_job_runs SET status = 'running' WHERE id = ?")
      .bind(childIds[0]).run();
    await expect(readOverallStatus()).resolves.toBe('running');

    await env.DB.prepare(`
      UPDATE sync_job_runs SET status = CASE WHEN id = ? THEN 'failed' ELSE 'succeeded' END
       WHERE pipeline_run_id = ? AND job_key <> 'canonical_workspace_sync'
    `).bind(childIds[0], pipelineRunId).run();
    await expect(readOverallStatus()).resolves.toBe('failed');

    await env.DB.prepare("UPDATE sync_job_runs SET status = 'succeeded' WHERE id = ?")
      .bind(childIds[0]).run();
    await expect(readOverallStatus()).resolves.toBe('succeeded');
  });

  it('returns baseline health instead of 500 while the observability migration is pending', async () => {
    await env.DB.prepare('DROP TABLE sync_job_runs').run();
    try {
      const response = await SELF.fetch(new Request('http://localhost/api/sync/status'));
      expect(response.status).toBe(200);
      const body = await response.json() as {
        observability_ready: boolean;
        overall: { last_success_at: string };
        jobs: Array<{ status: string }>;
      };
      expect(body.observability_ready).toBe(false);
      expect(body.overall.last_success_at).toBe('2020-01-01T00:00:00Z');
      expect(body.jobs.every(job => job.status === 'unknown')).toBe(true);
    } finally {
      await applySchema(env);
    }
  });

  it('shows a completed run and exposes its sanitized detail', async () => {
    const runId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory',
      trigger: 'scheduled',
      mode: 'live',
    });
    await recordSyncJobEvent(env.DB, runId, {
      type: 'repository_checked',
      entityType: 'repository',
      entityId: 123,
      details: { requests: 1, private_value: 'do not expose' },
    });
    await finishSyncJob(env.DB, runId, 'succeeded', { metrics: { repositories: 12 } });

    const statusResponse = await SELF.fetch(new Request('http://localhost/api/sync/status'));
    const status = await statusResponse.json() as { jobs: Array<{ key: string; recent_runs: Array<{ id: string }> }> };
    const inventory = status.jobs.find(job => job.key === 'repository_inventory');
    expect(inventory?.recent_runs[0].id).toBe(runId);

    const detailResponse = await SELF.fetch(new Request(`http://localhost/api/sync/status/runs/${runId}`));
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json() as { events: Array<{ details: Record<string, unknown> }> };
    expect(detail.events[0].details).toEqual({ requests: 1 });
  });

  it('retains only the newest 100 incomplete runs for each job', async () => {
    for (let index = 0; index < 102; index++) {
      const id = await startSyncJob(env.DB, {
        jobKey: 'orphan_cleanup',
        trigger: 'scheduled',
        mode: 'live',
      });
      await finishSyncJob(env.DB, id, 'failed', { errorCode: 'test_failure', error: `Failure ${index}` });
    }
    await pruneSyncJobHistory(env.DB);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sync_job_runs WHERE job_key = 'orphan_cleanup' AND status = 'failed'",
    ).first<{ count: number }>();
    expect(row?.count).toBe(100);
  });

  it('reuses and resets a job record when a Workflow step retries', async () => {
    const pipelineRunId = 'live-11111111-1111-4111-8111-111111111111';
    const options = {
      jobKey: 'repository_inventory',
      trigger: 'continuation' as const,
      mode: 'live' as const,
      pipelineRunId,
    };
    const firstId = await getOrStartSyncJob(env.DB, options);
    await finishSyncJob(env.DB, firstId, 'failed', {
      errorCode: 'github_request_failed',
      error: 'First attempt failed',
    });

    const retryId = await getOrStartSyncJob(env.DB, options);
    await resumeSyncJob(env.DB, retryId);

    expect(retryId).toBe(firstId);
    const rows = await env.DB.prepare(`
      SELECT status, finished_at, error_code
        FROM sync_job_runs
       WHERE pipeline_run_id = ? AND job_key = ? AND mode = ?
    `).bind(pipelineRunId, options.jobKey, options.mode).all<{
      status: string;
      finished_at: string | null;
      error_code: string | null;
    }>();
    expect(rows.results).toEqual([{
      status: 'running',
      finished_at: null,
      error_code: null,
    }]);
  });

  it('exposes incomplete runs beyond the ten-run summary and 100 days of budgets', async () => {
    for (let index = 0; index < 12; index++) {
      const id = await startSyncJob(env.DB, {
        jobKey: 'orphan_cleanup',
        trigger: 'scheduled',
        mode: 'live',
      });
      await finishSyncJob(env.DB, id, 'failed', { errorCode: 'test_failure', error: `Failure ${index}` });
    }
    await recordDailyBudget(env.DB, {
      key: 'workflow_steps', label: 'OASIS Workflow steps', unit: 'steps', limit: 2_000, consumedDelta: 12,
    });

    const response = await SELF.fetch(new Request('http://localhost/api/sync/status'));
    const body = await response.json() as {
      jobs: Array<{ key: string; recent_runs: unknown[] }>;
      incomplete_runs: Array<{ label: string; mode: string }>;
      budget_history: Array<{ budget_key: string; consumed: number }>;
    };
    expect(body.jobs.find(job => job.key === 'orphan_cleanup')?.recent_runs).toHaveLength(10);
    expect(body.incomplete_runs).toHaveLength(12);
    expect(body.incomplete_runs[0]).toEqual(expect.objectContaining({
      label: 'Orphan cleanup',
      mode: 'live',
    }));
    expect(body.budget_history).toContainEqual(expect.objectContaining({ budget_key: 'workflow_steps', consumed: 12 }));
  });

  it('records the peak per-instance request count without summing instance ceilings', async () => {
    await recordDailyBudget(env.DB, {
      key: 'workflow_external_request_limit', label: 'Peak Workflow instance requests',
      unit: 'requests per instance', limit: 50, consumedMaximum: 17,
    });
    await recordDailyBudget(env.DB, {
      key: 'workflow_external_request_limit', label: 'Peak Workflow instance requests',
      unit: 'requests per instance', limit: 50, consumedMaximum: 9,
    });
    const row = await env.DB.prepare(`
      SELECT consumed FROM sync_daily_budgets WHERE budget_key = 'workflow_external_request_limit'
    `).first<{ consumed: number }>();
    expect(row?.consumed).toBe(17);
  });
});
