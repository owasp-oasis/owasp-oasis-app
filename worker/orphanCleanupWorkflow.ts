import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { OrphanCleanupActor, OrphanCleanupParams, Env } from './types.js';
import { recordPrivilegedActionForActor } from './authorization.js';
import {
  finishSyncJob,
  isSyncJobActive,
  markSyncJobRunning,
  recordDailyBudget,
  recordSyncJobEvent,
  safeErrorSummary,
} from './syncJobs.js';

export const ORPHAN_CLEANUP_CHUNK_SIZE = 40;
const RETRY_LIMIT = 3;

interface CleanupWorkItem {
  id: string;
  entity_id: string;
  repo_name: string;
  number: number;
}

export interface OrphanCleanupChunkResult {
  checked: number;
  flagged: number;
  errors: number;
  remaining: number;
  terminal: boolean;
}

interface OrphanCleanupProgress {
  expected: number;
  completed: number;
  failed: number;
  flagged: number;
  remaining: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function workflowInstanceId(jobRunId: string, chunk: number): string {
  return `orphan-cleanup-${jobRunId}-${chunk}`
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 100);
}

async function createWorkflowInstance(env: Env, params: OrphanCleanupParams): Promise<string> {
  if (!env.ORPHAN_CLEANUP_WORKFLOW) throw new Error('Orphan cleanup Workflow binding is unavailable');
  if (!await isSyncJobActive(env.DB, params.jobRunId)) {
    throw new NonRetryableError('Orphan cleanup job was cancelled');
  }
  const id = workflowInstanceId(params.jobRunId, params.chunk);
  let createdId: string;
  try {
    const instance = await env.ORPHAN_CLEANUP_WORKFLOW.create({
      id,
      params,
      retention: { successRetention: '1 day', errorRetention: '3 days' },
    });
    createdId = instance.id;
  } catch (error) {
    try {
      const instance = await env.ORPHAN_CLEANUP_WORKFLOW.get(id);
      createdId = instance.id;
    } catch {
      throw error;
    }
  }
  await env.DB.prepare(`
    UPDATE sync_job_runs SET workflow_instance_id = ?
     WHERE id = ? AND status IN ('queued', 'running')
  `).bind(createdId, params.jobRunId).run();
  return createdId;
}

async function readProgress(db: D1Database, jobRunId: string): Promise<OrphanCleanupProgress> {
  const row = await db.prepare(`
    SELECT COUNT(*) AS expected,
           SUM(CASE WHEN status IN ('succeeded', 'failed') THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'succeeded' AND cursor = 'deleted' THEN 1 ELSE 0 END) AS flagged,
           SUM(CASE WHEN status IN ('pending', 'deferred', 'leased') THEN 1 ELSE 0 END) AS remaining
      FROM sync_work_items
     WHERE job_run_id = ? AND job_key = 'orphan_cleanup'
  `).bind(jobRunId).first<Record<string, number | null>>();
  return {
    expected: row?.expected ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    flagged: row?.flagged ?? 0,
    remaining: row?.remaining ?? 0,
  };
}

async function publishProgress(db: D1Database, jobRunId: string): Promise<OrphanCleanupProgress> {
  const progress = await readProgress(db, jobRunId);
  await db.prepare(`
    UPDATE sync_job_runs
       SET expected_items = ?, completed_items = ?, failed_items = ?, metrics_json = ?
     WHERE id = ?
  `).bind(
    progress.expected,
    progress.completed,
    progress.failed,
    JSON.stringify({
      chunk_size: ORPHAN_CLEANUP_CHUNK_SIZE,
      checked: progress.completed,
      flagged: progress.flagged,
      errors: progress.failed,
      remaining: progress.remaining,
    }),
    jobRunId,
  ).run();
  return progress;
}

async function markWorkItemSucceeded(
  db: D1Database,
  itemId: string,
  deleted: boolean,
): Promise<void> {
  await db.prepare(`
    UPDATE sync_work_items
       SET status = 'succeeded', attempts = attempts + 1, cursor = ?,
           leased_at = NULL, lease_expires_at = NULL,
           last_error_code = NULL, last_error_summary = NULL, updated_at = ?
     WHERE id = ?
  `).bind(deleted ? 'deleted' : 'present', nowIso(), itemId).run();
}

async function markWorkItemFailed(
  db: D1Database,
  itemId: string,
  code: string,
  error: unknown,
): Promise<void> {
  await db.prepare(`
    UPDATE sync_work_items
       SET status = 'failed', attempts = attempts + 1,
           leased_at = NULL, lease_expires_at = NULL,
           last_error_code = ?, last_error_summary = ?, updated_at = ?
     WHERE id = ?
  `).bind(code, safeErrorSummary(error), nowIso(), itemId).run();
}

/** Process one external-request-bounded slice of an orphan cleanup run. */
export async function processOrphanCleanupChunk(
  env: Env,
  jobRunId: string,
): Promise<OrphanCleanupChunkResult> {
  const rows = await env.DB.prepare(`
    SELECT wi.id, wi.entity_id, r.name AS repo_name, p.number
      FROM sync_work_items wi
      JOIN pull_requests p ON CAST(p.id AS TEXT) = wi.entity_id
      JOIN repos r ON r.id = p.repo_id
     WHERE wi.job_run_id = ? AND wi.job_key = 'orphan_cleanup'
       AND wi.status IN ('pending', 'deferred')
     ORDER BY CAST(wi.entity_id AS INTEGER) DESC
     LIMIT ?
  `).bind(jobRunId, ORPHAN_CLEANUP_CHUNK_SIZE).all<CleanupWorkItem>();

  let checked = 0;
  let flagged = 0;
  let errors = 0;
  let terminal = false;

  for (const item of rows.results ?? []) {
    checked += 1;
    let response: Response | null = null;
    try {
      response = await fetch(
        `https://api.github.com/repos/owasp-oasis/${encodeURIComponent(item.repo_name)}/pulls/${item.number}`,
        {
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'oasis-cleanup/2.0',
          },
        },
      );
      if (response.body) await response.body.cancel();

      if (response.status === 404 || response.status === 410) {
        await env.DB.prepare(
          'UPDATE pull_requests SET deleted = 1, deleted_at = ? WHERE id = ? AND deleted = 0',
        ).bind(nowIso(), Number(item.entity_id)).run();
        await markWorkItemSucceeded(env.DB, item.id, true);
        flagged += 1;
      } else if (response.ok) {
        await markWorkItemSucceeded(env.DB, item.id, false);
      } else {
        const code = `github_http_${response.status}`;
        await markWorkItemFailed(env.DB, item.id, code, `GitHub returned HTTP ${response.status}`);
        await recordSyncJobEvent(env.DB, jobRunId, {
          type: 'orphan_check_failed',
          entityType: 'pull_request',
          entityId: item.entity_id,
          responseStatus: response.status,
          message: `GitHub returned HTTP ${response.status}`,
        });
        errors += 1;
        if (response.status === 401 || response.status === 403) {
          terminal = true;
          break;
        }
      }
    } catch (error) {
      await markWorkItemFailed(env.DB, item.id, 'github_request_failed', error);
      await recordSyncJobEvent(env.DB, jobRunId, {
        type: 'orphan_check_failed',
        entityType: 'pull_request',
        entityId: item.entity_id,
        responseStatus: response?.status ?? null,
        message: error instanceof Error ? error.message : 'GitHub request failed',
      });
      errors += 1;
    }
  }

  if (terminal) {
    await env.DB.prepare(`
      UPDATE sync_work_items
         SET status = 'deferred', last_error_code = 'blocked_by_github_authentication',
             last_error_summary = 'Cleanup stopped after GitHub rejected its credentials.', updated_at = ?
       WHERE job_run_id = ? AND job_key = 'orphan_cleanup' AND status = 'pending'
    `).bind(nowIso(), jobRunId).run();
  }

  const progress = await publishProgress(env.DB, jobRunId);
  return { checked, flagged, errors, remaining: progress.remaining, terminal };
}

async function finishLegacyParent(
  env: Env,
  parentRunId: string,
  cleanupErrors: number,
): Promise<void> {
  const parent = await env.DB.prepare(
    'SELECT metrics_json FROM sync_job_runs WHERE id = ?',
  ).bind(parentRunId).first<{ metrics_json: string }>();
  let metrics: Record<string, number | boolean | null> = {};
  try {
    metrics = JSON.parse(parent?.metrics_json ?? '{}') as Record<string, number | boolean | null>;
  } catch { /* retain an empty metrics object */ }
  const repositoryErrors = typeof metrics.repository_errors === 'number' ? metrics.repository_errors : 0;
  const syncErrors = typeof metrics.sync_errors === 'number' ? metrics.sync_errors : 0;
  const ok = repositoryErrors === 0 && syncErrors === 0 && cleanupErrors === 0;
  await finishSyncJob(env.DB, parentRunId, ok ? 'succeeded' : 'failed', {
    metrics: {
      ...metrics,
      cleanup_pending: false,
      cleanup_errors: cleanupErrors,
    },
    errorCode: ok ? null : 'legacy_pipeline_incomplete',
    error: ok ? undefined : 'At least one legacy synchronization stage did not complete successfully.',
  });
}

async function auditTerminalOutcome(
  env: Env,
  actor: OrphanCleanupActor | undefined,
  outcome: 'succeeded' | 'failed',
): Promise<void> {
  if (!actor) return;
  await recordPrivilegedActionForActor(env, actor, {
    action: 'sync_job.retry',
    targetType: 'sync_job',
    targetId: 'orphan_cleanup',
    outcome,
  }).catch(() => {
    console.error(JSON.stringify({ event: 'privileged_action_audit_failed', action: 'sync_job.retry' }));
  });
}

async function finishOrphanCleanup(
  env: Env,
  params: OrphanCleanupParams,
  terminalError?: unknown,
): Promise<OrphanCleanupProgress> {
  const progress = await readProgress(env.DB, params.jobRunId);
  const cleanupErrors = progress.failed + (terminalError !== undefined && progress.failed === 0 ? 1 : 0);
  const failed = cleanupErrors > 0;
  await finishSyncJob(env.DB, params.jobRunId, failed ? 'failed' : 'succeeded', {
    metrics: {
      bounded_workflow: true,
      chunk_size: ORPHAN_CLEANUP_CHUNK_SIZE,
      checked: progress.completed,
      flagged: progress.flagged,
      errors: cleanupErrors,
      remaining: progress.remaining,
    },
    completedItems: progress.completed,
    failedItems: progress.failed,
    errorCode: terminalError !== undefined
      ? 'orphan_cleanup_workflow_failed'
      : failed ? 'orphan_checks_failed' : null,
    error: terminalError !== undefined
      ? terminalError
      : failed
        ? `${progress.failed} orphan check(s) failed; ${progress.remaining} item(s) remain deferred.`
        : undefined,
  });
  if (params.legacyParentRunId) {
    await finishLegacyParent(env, params.legacyParentRunId, cleanupErrors);
  }
  await auditTerminalOutcome(env, params.auditActor, failed ? 'failed' : 'succeeded');
  return progress;
}

export async function initializeOrphanCleanupRun(
  env: Env,
  params: Omit<OrphanCleanupParams, 'chunk'>,
): Promise<string> {
  if (!env.ORPHAN_CLEANUP_WORKFLOW) throw new Error('Orphan cleanup Workflow binding is unavailable');
  if (!await isSyncJobActive(env.DB, params.jobRunId)) {
    throw new NonRetryableError('Orphan cleanup job was cancelled');
  }
  await seedOrphanCleanupWorkItems(env.DB, params.jobRunId, params.pipelineRunId);
  if (!await isSyncJobActive(env.DB, params.jobRunId)) {
    await env.DB.prepare(`
      UPDATE sync_work_items
         SET status = 'failed', last_error_code = 'cancelled_by_admin',
             last_error_summary = 'Cancelled by an administrator.', updated_at = ?
       WHERE job_run_id = ? AND status IN ('pending', 'leased', 'deferred')
    `).bind(nowIso(), params.jobRunId).run();
    throw new NonRetryableError('Orphan cleanup job was cancelled');
  }
  const progress = await publishProgress(env.DB, params.jobRunId);
  await env.DB.prepare(
    "UPDATE sync_job_runs SET status = 'queued', expected_items = ? WHERE id = ? AND status IN ('queued', 'running')",
  ).bind(progress.expected, params.jobRunId).run();
  const workflowId = await createWorkflowInstance(env, { ...params, chunk: 0 });
  await env.DB.prepare(
    'UPDATE sync_job_runs SET workflow_instance_id = ? WHERE id = ?',
  ).bind(workflowId, params.jobRunId).run();
  return workflowId;
}

/** Snapshot the current cleanup scope so chained chunks cannot skip or duplicate PRs. */
export async function seedOrphanCleanupWorkItems(
  db: D1Database,
  jobRunId: string,
  pipelineRunId: string,
): Promise<number> {
  const timestamp = nowIso();
  await db.prepare(`
    INSERT OR IGNORE INTO sync_work_items (
      id, pipeline_run_id, job_run_id, job_key, entity_type, entity_id,
      payload_json, status, created_at, updated_at
    )
    SELECT ? || ':' || CAST(p.id AS TEXT), ?, ?, 'orphan_cleanup', 'pull_request',
           CAST(p.id AS TEXT), '{}', 'pending', ?, ?
      FROM pull_requests p
      JOIN repos r ON r.id = p.repo_id
     WHERE p.deleted = 0 AND r.active = 1
  `).bind(jobRunId, pipelineRunId, jobRunId, timestamp, timestamp).run();
  const progress = await readProgress(db, jobRunId);
  return progress.expected;
}

export async function failOrphanCleanupDispatch(
  env: Env,
  params: Omit<OrphanCleanupParams, 'chunk'>,
  error: unknown,
): Promise<void> {
  await finishOrphanCleanup(env, { ...params, chunk: 0 }, error);
  console.error(JSON.stringify({ event: 'orphan_cleanup_dispatch_failed', job_run_id: params.jobRunId }));
}

export class OrphanCleanupWorkflow extends WorkflowEntrypoint<Env, OrphanCleanupParams> {
  async run(
    event: WorkflowEvent<OrphanCleanupParams>,
    step: WorkflowStep,
  ): Promise<Record<string, number | boolean>> {
    return step.do('process bounded orphan cleanup chunk', {
      retries: { limit: RETRY_LIMIT, delay: '10 seconds', backoff: 'exponential' },
      timeout: '15 minutes',
    }, async (context): Promise<Record<string, number | boolean>> => {
      try {
        if (!await isSyncJobActive(this.env.DB, event.payload.jobRunId)) {
          return {
            done: true,
            cancelled: true,
            checked: 0,
            flagged: 0,
            errors: 0,
            remaining: 0,
          };
        }
        await markSyncJobRunning(this.env.DB, event.payload.jobRunId);
        const chunk = await processOrphanCleanupChunk(this.env, event.payload.jobRunId);
        await recordSyncJobEvent(this.env.DB, event.payload.jobRunId, {
          type: chunk.terminal ? 'orphan_cleanup_blocked' : 'orphan_cleanup_chunk_complete',
          entityType: 'cleanup_chunk',
          entityId: event.payload.chunk,
          attempt: context.attempt,
          details: {
            chunk: event.payload.chunk,
            checked: chunk.checked,
            flagged: chunk.flagged,
            errors: chunk.errors,
            remaining: chunk.remaining,
            terminal: chunk.terminal,
          },
        });
        await Promise.all([
          recordDailyBudget(this.env.DB, {
            key: 'workflow_steps', label: 'OASIS Workflow steps', unit: 'steps',
            limit: 2_000, consumedDelta: 1,
          }),
          recordDailyBudget(this.env.DB, {
            key: 'github_rest', label: 'GitHub REST API', unit: 'requests',
            consumedDelta: chunk.checked,
          }),
        ]);

        if (chunk.terminal || chunk.remaining === 0) {
          const progress = await finishOrphanCleanup(this.env, event.payload);
          return {
            done: true,
            checked: progress.completed,
            flagged: progress.flagged,
            errors: progress.failed,
            remaining: progress.remaining,
          };
        }

        await createWorkflowInstance(this.env, {
          ...event.payload,
          chunk: event.payload.chunk + 1,
        });
        return {
          done: false,
          checked: chunk.checked,
          flagged: chunk.flagged,
          errors: chunk.errors,
          remaining: chunk.remaining,
        };
      } catch (error) {
        if (error instanceof NonRetryableError) throw error;
        if (context.attempt <= RETRY_LIMIT) throw error;
        await finishOrphanCleanup(this.env, event.payload, error);
        throw new NonRetryableError(
          error instanceof Error ? error.message : 'Bounded orphan cleanup failed',
        );
      }
    });
  }
}
