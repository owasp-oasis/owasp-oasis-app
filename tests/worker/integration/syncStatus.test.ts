import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB } from './helpers.js';
import {
  finishSyncJob,
  getOrStartSyncJob,
  pruneSyncJobHistory,
  recordDailyBudget,
  recordSyncJobEvent,
  resumeSyncJob,
  startSyncJob,
} from '../../../worker/syncJobs.js';

describe('public sync status', () => {
  beforeAll(async () => applySchema(env));
  afterEach(async () => cleanDB(env));

  it('returns canonical health, registered jobs, and short cache headers', async () => {
    const response = await SELF.fetch(new Request('http://localhost/api/sync/status'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('max-age=15');
    const body = await response.json<Record<string, unknown>>() as {
      overall: { last_success_at: string };
      jobs: Array<{ key: string }>;
    };
    expect(body.overall.last_success_at).toBe('2020-01-01T00:00:00Z');
    expect(body.jobs.some(job => job.key === 'repository_inventory')).toBe(true);
    expect(body.jobs.some(job => job.key === 'hubspot_contacts')).toBe(true);
  });

  it('shows a completed run and exposes its sanitized detail', async () => {
    const runId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory',
      trigger: 'scheduled',
      mode: 'shadow',
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
        mode: 'shadow',
      });
      await finishSyncJob(env.DB, id, 'failed', { errorCode: 'test_failure', error: `Failure ${index}` });
    }
    await pruneSyncJobHistory(env.DB);
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sync_job_runs WHERE job_key = 'orphan_cleanup' AND status = 'failed'",
    ).first<{ count: number }>();
    expect(row?.count).toBe(100);
  });

  it('reuses and resets a shadow job record when a Workflow step retries', async () => {
    const pipelineRunId = 'shadow-11111111-1111-4111-8111-111111111111';
    const options = {
      jobKey: 'repository_inventory',
      trigger: 'workflow' as const,
      mode: 'shadow' as const,
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
        mode: 'shadow',
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
      mode: 'shadow',
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
