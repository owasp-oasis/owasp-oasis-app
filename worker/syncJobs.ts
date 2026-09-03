import type { Env } from './types.js';

export type SyncJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'deferred'
  | 'interrupted';

export type SyncJobMode = 'legacy' | 'shadow' | 'live';
export type SyncJobTrigger = 'scheduled' | 'manual' | 'continuation' | 'submission';
export type SyncJobCategory = 'workspace' | 'integration' | 'analytics';

export interface SyncJobDefinition {
  key: string;
  label: string;
  category: SyncJobCategory;
  schedule: string;
  criticalForWorkspace: boolean;
  retryable: boolean;
}

export interface StartSyncJobOptions {
  jobKey: string;
  pipelineRunId?: string | null;
  workflowInstanceId?: string | null;
  trigger: SyncJobTrigger;
  mode: SyncJobMode;
  status?: 'queued' | 'running';
  expectedItems?: number;
}

export const SYNC_JOBS: readonly SyncJobDefinition[] = [
  { key: 'legacy_workspace_sync', label: 'Legacy Workspace sync', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'canonical_workspace_sync', label: 'Canonical Workspace sync', category: 'workspace', schedule: 'Manual canary; every 4 hours after activation', criticalForWorkspace: true, retryable: true },
  { key: 'shadow_sync_dispatch', label: 'Shadow sync dispatch', category: 'workspace', schedule: 'Daily in preview', criticalForWorkspace: false, retryable: true },
  { key: 'repository_inventory', label: 'Repository inventory', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'pull_request_catalog', label: 'Pull request catalog', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'upstream_merge_status', label: 'Upstream merge status', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'pull_request_comments', label: 'Pull request comments', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'comment_reactions', label: 'Comment reactions', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'vote_projection', label: 'Vote projection', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'duplicate_resolution', label: 'Duplicate resolution', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'contributor_scores', label: 'Contributor scores', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'orphan_cleanup', label: 'Orphan cleanup', category: 'workspace', schedule: 'Every 4 hours', criticalForWorkspace: true, retryable: true },
  { key: 'hubspot_contacts', label: 'HubSpot contacts', category: 'integration', schedule: 'Hourly at :15', criticalForWorkspace: false, retryable: true },
  { key: 'cloudflare_analytics', label: 'Cloudflare analytics archive', category: 'analytics', schedule: 'Daily (planned)', criticalForWorkspace: false, retryable: false },
] as const;

const JOB_BY_KEY = new Map(SYNC_JOBS.map(job => [job.key, job]));
const TERMINAL_INCOMPLETE: readonly SyncJobStatus[] = ['failed', 'skipped', 'deferred', 'interrupted'];
const WORKSPACE_CHILD_JOB_KEYS = new Set([
  'repository_inventory',
  'pull_request_catalog',
  'upstream_merge_status',
  'pull_request_comments',
  'comment_reactions',
  'vote_projection',
  'duplicate_resolution',
  'contributor_scores',
  'orphan_cleanup',
]);

function nowIso(): string {
  return new Date().toISOString();
}

export function safeErrorSummary(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
    .replace(/\b(?:gh[opsu]_[A-Za-z0-9]{20,}|[a-f0-9]{40,})\b/gi, '[redacted credential]')
    .slice(0, 500);
}

export function sanitizeMetrics(metrics: Record<string, unknown>): Record<string, number | boolean | null> {
  const result: Record<string, number | boolean | null> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = value;
    else if (typeof value === 'boolean' || value === null) result[key] = value;
  }
  return result;
}

export async function startSyncJob(
  db: D1Database,
  options: StartSyncJobOptions,
): Promise<string> {
  const definition = JOB_BY_KEY.get(options.jobKey);
  if (!definition) throw new Error(`Unknown sync job: ${options.jobKey}`);
  const id = crypto.randomUUID();
  const startedAt = nowIso();
  await db.prepare(`
    INSERT INTO sync_job_runs (
      id, pipeline_run_id, workflow_instance_id, job_key, label, category,
      trigger_type, mode, status, started_at, expected_items, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    options.pipelineRunId ?? null,
    options.workflowInstanceId ?? null,
    definition.key,
    definition.label,
    definition.category,
    options.trigger,
    options.mode,
    options.status ?? 'running',
    startedAt,
    options.expectedItems ?? 0,
    startedAt,
  ).run();
  return id;
}

export async function getOrStartSyncJob(
  db: D1Database,
  options: StartSyncJobOptions & { pipelineRunId: string },
): Promise<string> {
  const existing = await db.prepare(`
    SELECT id FROM sync_job_runs
     WHERE pipeline_run_id = ? AND job_key = ? AND mode = ?
     ORDER BY created_at LIMIT 1
  `).bind(options.pipelineRunId, options.jobKey, options.mode).first<{ id: string }>();
  return existing?.id ?? startSyncJob(db, options);
}

export async function resumeSyncJob(db: D1Database, jobRunId: string): Promise<void> {
  await db.prepare(`
    UPDATE sync_job_runs
       SET status = 'running', finished_at = NULL, duration_ms = NULL,
           completed_items = 0, failed_items = 0, metrics_json = '{}',
           error_code = NULL, error_summary = NULL
     WHERE id = ?
       AND NOT (status = 'failed' AND error_code = 'cancelled_by_admin')
  `).bind(jobRunId).run();
}

export async function finishSyncJob(
  db: D1Database,
  jobRunId: string,
  status: Exclude<SyncJobStatus, 'queued' | 'running'>,
  options: {
    metrics?: Record<string, unknown>;
    completedItems?: number;
    failedItems?: number;
    errorCode?: string | null;
    error?: unknown;
  } = {},
): Promise<void> {
  const finishedAt = nowIso();
  const started = await db.prepare('SELECT started_at FROM sync_job_runs WHERE id = ?')
    .bind(jobRunId).first<{ started_at: string }>();
  const duration = started ? Math.max(0, Date.parse(finishedAt) - Date.parse(started.started_at)) : null;
  await db.prepare(`
    UPDATE sync_job_runs
       SET status = ?, finished_at = ?, duration_ms = ?, metrics_json = ?,
           completed_items = ?, failed_items = ?, error_code = ?, error_summary = ?
     WHERE id = ?
       AND NOT (status = 'failed' AND error_code = 'cancelled_by_admin')
  `).bind(
    status,
    finishedAt,
    duration,
    JSON.stringify(sanitizeMetrics(options.metrics ?? {})),
    options.completedItems ?? 0,
    options.failedItems ?? 0,
    options.errorCode ?? null,
    options.error === undefined ? null : safeErrorSummary(options.error),
    jobRunId,
  ).run();
}

export async function markSyncJobRunning(db: D1Database, jobRunId: string, expectedItems = 0): Promise<void> {
  await db.prepare(`
    UPDATE sync_job_runs
       SET status = 'running', expected_items = ?, started_at = ?
     WHERE id = ? AND status = 'queued'
  `).bind(expectedItems, nowIso(), jobRunId).run();
}

export async function isSyncJobActive(db: D1Database, jobRunId: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT 1 AS active FROM sync_job_runs
     WHERE id = ? AND status IN ('queued', 'running')
  `).bind(jobRunId).first<{ active: number }>();
  return row?.active === 1;
}

export async function incrementSyncJobProgress(
  db: D1Database,
  jobRunId: string,
  completedDelta: number,
  failedDelta = 0,
): Promise<void> {
  await db.prepare(`
    UPDATE sync_job_runs
       SET completed_items = completed_items + ?, failed_items = failed_items + ?
     WHERE id = ? AND status IN ('queued', 'running')
  `).bind(completedDelta, failedDelta, jobRunId).run();
}

export function aggregateSyncJobStatuses(
  statuses: readonly SyncJobStatus[],
  expectedCount = statuses.length,
): 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' {
  if (statuses.length === 0) return 'unknown';
  if (statuses.length < expectedCount) return 'running';
  if (statuses.every(status => status === 'queued')) return 'queued';
  if (statuses.some(status => status === 'queued' || status === 'running')) return 'running';
  if (statuses.every(status => status === 'succeeded')) return 'succeeded';
  return 'failed';
}

export async function recordSyncJobEvent(
  db: D1Database,
  jobRunId: string,
  event: {
    type: string;
    entityType?: string | null;
    entityId?: string | number | null;
    attempt?: number | null;
    responseStatus?: number | null;
    message?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await db.prepare(`
    INSERT INTO sync_job_events (
      job_run_id, event_type, entity_type, entity_id, attempt,
      response_status, message, details_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    jobRunId,
    event.type.slice(0, 80),
    event.entityType?.slice(0, 80) ?? null,
    event.entityId === undefined || event.entityId === null ? null : String(event.entityId).slice(0, 120),
    event.attempt ?? null,
    event.responseStatus ?? null,
    event.message ? safeErrorSummary(event.message) : null,
    JSON.stringify(sanitizeMetrics(event.details ?? {})),
    nowIso(),
  ).run();
}

export async function interruptExpiredSyncJobs(db: D1Database, olderThanHours = 6): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3_600_000).toISOString();
  const result = await db.prepare(`
    UPDATE sync_job_runs
       SET status = 'interrupted', finished_at = ?, error_code = 'lease_expired',
           error_summary = 'The job stopped reporting progress before its lease expired.'
     WHERE status IN ('queued', 'running') AND started_at < ?
  `).bind(nowIso(), cutoff).run();
  return result.meta.changes ?? 0;
}

export async function pruneSyncJobHistory(db: D1Database): Promise<void> {
  const successfulCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const budgetCutoff = new Date(Date.now() - 99 * 86_400_000).toISOString().slice(0, 10);
  await db.prepare("DELETE FROM sync_job_runs WHERE status = 'succeeded' AND started_at < ?")
    .bind(successfulCutoff).run();

  // Preserve the newest 100 incomplete runs for every logical job, even when
  // they are older than the normal successful-run history window.
  await db.prepare(`
    DELETE FROM sync_job_runs
     WHERE id IN (
       SELECT id FROM (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY job_key ORDER BY started_at DESC) AS position
           FROM sync_job_runs
          WHERE status IN ('failed', 'skipped', 'deferred', 'interrupted')
       ) ranked
       WHERE position > 100
     )
  `).run();
  await db.prepare('DELETE FROM sync_daily_budgets WHERE budget_date < ?')
    .bind(budgetCutoff).run();
}

export async function recordDailyBudget(
  db: D1Database,
  input: {
    key: string;
    label: string;
    unit: string;
    limit?: number | null;
    consumedDelta?: number;
    consumedMaximum?: number;
    reservedDelta?: number;
    deferredDelta?: number;
    remaining?: number | null;
    resetAt?: string | null;
  },
): Promise<void> {
  const date = nowIso().slice(0, 10);
  await db.prepare(`
    INSERT INTO sync_daily_budgets (
      budget_date, budget_key, label, unit, configured_limit, consumed,
      reserved, deferred, remaining, reset_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(budget_date, budget_key) DO UPDATE SET
      label = excluded.label,
      unit = excluded.unit,
      configured_limit = COALESCE(excluded.configured_limit, sync_daily_budgets.configured_limit),
      consumed = CASE
        WHEN ? = 1 THEN MAX(sync_daily_budgets.consumed, excluded.consumed)
        ELSE sync_daily_budgets.consumed + excluded.consumed
      END,
      reserved = sync_daily_budgets.reserved + excluded.reserved,
      deferred = sync_daily_budgets.deferred + excluded.deferred,
      remaining = COALESCE(excluded.remaining, sync_daily_budgets.remaining),
      reset_at = COALESCE(excluded.reset_at, sync_daily_budgets.reset_at),
      updated_at = excluded.updated_at
  `).bind(
    date,
    input.key,
    input.label,
    input.unit,
    input.limit ?? null,
    input.consumedMaximum ?? input.consumedDelta ?? 0,
    input.reservedDelta ?? 0,
    input.deferredDelta ?? 0,
    input.remaining ?? null,
    input.resetAt ?? null,
    nowIso(),
    input.consumedMaximum === undefined ? 0 : 1,
  ).run();
}

interface JobRunRow {
  id: string;
  pipeline_run_id: string | null;
  workflow_instance_id: string | null;
  job_key: string;
  label: string;
  category: SyncJobCategory;
  trigger_type: SyncJobTrigger;
  mode: SyncJobMode;
  status: SyncJobStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  expected_items: number;
  completed_items: number;
  failed_items: number;
  metrics_json: string;
  error_code: string | null;
  error_summary: string | null;
}

function publicRun(row: JobRunRow): Record<string, unknown> {
  let metrics: Record<string, unknown> = {};
  try { metrics = JSON.parse(row.metrics_json) as Record<string, unknown>; } catch { /* malformed legacy row */ }
  return {
    id: row.id,
    pipeline_run_id: row.pipeline_run_id,
    workflow_instance_id: row.workflow_instance_id,
    job_key: row.job_key,
    label: row.label,
    category: row.category,
    trigger: row.trigger_type,
    mode: row.mode,
    status: row.status,
    started_at: row.started_at,
    finished_at: row.finished_at,
    duration_ms: row.duration_ms,
    progress: {
      expected: row.expected_items,
      completed: row.completed_items,
      failed: row.failed_items,
    },
    metrics: sanitizeMetrics(metrics),
    error: row.error_code || row.error_summary
      ? { code: row.error_code, summary: row.error_summary }
      : null,
  };
}

async function getSyncStatusWithObservability(env: Env): Promise<Record<string, unknown>> {
  const db = env.DB;
  const budgetCutoff = new Date(Date.now() - 99 * 86_400_000).toISOString().slice(0, 10);
  const [stateRows, runRows, incompleteRows, parity, budgets, budgetHistory, hubspot, canonicalLock] = await Promise.all([
    db.prepare(`SELECT key, value FROM sync_state WHERE key IN (
      'last_synced_at', 'sync_running', 'canonical_sync_enabled',
      'canonical_pipeline_run_id', 'canonical_pipeline_phase', 'canonical_pipeline_updated_at'
    )`)
      .all<{ key: string; value: string }>(),
    db.prepare(`
      SELECT * FROM sync_job_runs
       WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY job_key ORDER BY started_at DESC) AS position
             FROM sync_job_runs
         ) ranked WHERE position <= 10
       )
       ORDER BY started_at DESC
    `).all<JobRunRow>(),
    db.prepare(`
      SELECT * FROM sync_job_runs
       WHERE status IN ('failed', 'skipped', 'deferred', 'interrupted')
       ORDER BY started_at DESC LIMIT 100
    `).all<JobRunRow>(),
    db.prepare('SELECT * FROM sync_parity_runs ORDER BY created_at DESC LIMIT 1').first<Record<string, unknown>>(),
    db.prepare('SELECT * FROM sync_daily_budgets WHERE budget_date = ? ORDER BY budget_key')
      .bind(nowIso().slice(0, 10)).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT * FROM sync_daily_budgets
       WHERE budget_date >= ?
       ORDER BY budget_date DESC, budget_key
    `).bind(budgetCutoff).all<Record<string, unknown>>(),
    db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced
      FROM hubspot_sync_queue
    `).first<Record<string, number | null>>(),
    db.prepare(`
      SELECT pipeline_run_id, acquired_at, lease_expires_at
        FROM sync_pipeline_locks WHERE lock_key = 'canonical_workspace_sync'
    `).first<Record<string, unknown>>(),
  ]);

  const state = new Map((stateRows.results ?? []).map(row => [row.key, row.value]));
  const lastSuccessAt = state.get('last_synced_at') ?? null;
  const running = state.get('sync_running') === '1';
  const workspaceParents = (runRows.results ?? []).filter(row => (
    row.job_key === 'legacy_workspace_sync' || row.job_key === 'canonical_workspace_sync'
  ));
  const latestWorkspace = workspaceParents.sort(
    (left, right) => Date.parse(right.started_at) - Date.parse(left.started_at),
  )[0];
  const latestWorkspaceChildren = latestWorkspace
    ? (runRows.results ?? []).filter(row => (
        row.pipeline_run_id === latestWorkspace.pipeline_run_id
        && row.mode === latestWorkspace.mode
        && WORKSPACE_CHILD_JOB_KEYS.has(row.job_key)
      ))
    : [];
  const overallStatus = aggregateSyncJobStatuses(
    latestWorkspaceChildren.map(row => row.status),
    WORKSPACE_CHILD_JOB_KEYS.size,
  );

  const byJob = new Map<string, JobRunRow[]>();
  for (const row of runRows.results ?? []) {
    const list = byJob.get(row.job_key) ?? [];
    list.push(row);
    byJob.set(row.job_key, list);
  }

  const jobs = SYNC_JOBS.map(definition => {
    const runs = byJob.get(definition.key) ?? [];
    return {
      key: definition.key,
      label: definition.label,
      category: definition.category,
      schedule: definition.schedule,
      critical_for_workspace: definition.criticalForWorkspace,
      retryable: definition.retryable && env.ENVIRONMENT === 'production',
      status: runs[0]?.status ?? 'unknown',
      latest_run: runs[0] ? publicRun(runs[0]) : null,
      recent_runs: runs.map(publicRun),
    };
  });

  return {
    generated_at: nowIso(),
    observability_ready: true,
    overall: {
      status: overallStatus,
      sync_running: running,
      last_success_at: lastSuccessAt,
      last_attempt_at: latestWorkspace?.started_at ?? null,
      stale_after_hours: 8,
    },
    canonical: {
      schedule_enabled: state.get('canonical_sync_enabled') === '1',
      pipeline_run_id: state.get('canonical_pipeline_run_id') || null,
      phase: state.get('canonical_pipeline_phase') ?? 'idle',
      updated_at: state.get('canonical_pipeline_updated_at') ?? null,
      lock: canonicalLock ? {
        pipeline_run_id: canonicalLock['pipeline_run_id'],
        acquired_at: canonicalLock['acquired_at'],
        lease_expires_at: canonicalLock['lease_expires_at'],
      } : null,
    },
    shadow: parity ? {
      pipeline_run_id: parity['pipeline_run_id'],
      canonical_pipeline_run_id: parity['canonical_pipeline_run_id'],
      status: parity['status'],
      comparable_entities: parity['comparable_entities'],
      matched_entities: parity['matched_entities'],
      changed_during_run: parity['changed_during_run'],
      difference_count: parity['difference_count'],
      consecutive_matches: parity['consecutive_matches'],
      required_consecutive_matches: 3,
      eligible_for_cutover: parity['eligible_for_cutover'] === 1,
      compared_at: parity['compared_at'],
    } : null,
    budgets: budgets.results ?? [],
    budget_history: budgetHistory.results ?? [],
    incomplete_runs: (incompleteRows.results ?? []).map(publicRun),
    integrations: {
      hubspot_queue: {
        pending: hubspot?.pending ?? 0,
        processing: hubspot?.processing ?? 0,
        synced: hubspot?.synced ?? 0,
      },
    },
    jobs,
  };
}

const OBSERVABILITY_TABLES = [
  'sync_job_runs',
  'sync_job_events',
  'sync_work_items',
  'sync_shadow_entities',
  'sync_parity_runs',
  'sync_parity_differences',
  'sync_daily_budgets',
  'sync_pipeline_locks',
] as const;

export function isMissingSyncObservabilityTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return OBSERVABILITY_TABLES.some(table => (
    new RegExp(`no such table:\\s*(?:main\\.)?${table}\\b`, 'i').test(message)
  ));
}

async function getPreMigrationSyncStatus(env: Env): Promise<Record<string, unknown>> {
  const stateRows = await env.DB.prepare(
    "SELECT key, value FROM sync_state WHERE key IN ('last_synced_at', 'sync_running')",
  ).all<{ key: string; value: string }>();
  const hubspot = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
      SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced
    FROM hubspot_sync_queue
  `).first<Record<string, number | null>>().catch(() => null);
  const state = new Map((stateRows.results ?? []).map(row => [row.key, row.value]));
  const lastSuccessAt = state.get('last_synced_at') ?? null;
  const running = state.get('sync_running') === '1';
  const overallStatus = running ? 'running' : 'unknown';

  return {
    generated_at: nowIso(),
    observability_ready: false,
    overall: {
      status: overallStatus,
      sync_running: running,
      last_success_at: lastSuccessAt,
      last_attempt_at: null,
      stale_after_hours: 8,
    },
    shadow: null,
    canonical: {
      schedule_enabled: false,
      pipeline_run_id: null,
      phase: 'migration_required',
      updated_at: null,
      lock: null,
    },
    budgets: [],
    budget_history: [],
    incomplete_runs: [],
    integrations: {
      hubspot_queue: {
        pending: hubspot?.pending ?? 0,
        processing: hubspot?.processing ?? 0,
        synced: hubspot?.synced ?? 0,
      },
    },
    jobs: SYNC_JOBS.map(definition => ({
      key: definition.key,
      label: definition.label,
      category: definition.category,
      schedule: definition.schedule,
      critical_for_workspace: definition.criticalForWorkspace,
      retryable: false,
      status: 'unknown',
      latest_run: null,
      recent_runs: [],
    })),
  };
}

export async function getSyncStatus(env: Env): Promise<Record<string, unknown>> {
  try {
    return await getSyncStatusWithObservability(env);
  } catch (error) {
    if (!isMissingSyncObservabilityTableError(error)) throw error;
    console.warn(JSON.stringify({
      event: 'sync_status_observability_schema_unavailable',
      action: 'apply_d1_migrations',
    }));
    return getPreMigrationSyncStatus(env);
  }
}

export async function getSyncRunDetail(env: Env, runId: string): Promise<Record<string, unknown> | null> {
  const run = await env.DB.prepare('SELECT * FROM sync_job_runs WHERE id = ?')
    .bind(runId).first<JobRunRow>();
  if (!run) return null;
  const events = await env.DB.prepare(`
    SELECT event_type, entity_type, entity_id, attempt, response_status,
           message, details_json, created_at
      FROM sync_job_events WHERE job_run_id = ? ORDER BY created_at, id LIMIT 500
  `).bind(runId).all<{
    event_type: string;
    entity_type: string | null;
    entity_id: string | null;
    attempt: number | null;
    response_status: number | null;
    message: string | null;
    details_json: string;
    created_at: string;
  }>();
  return {
    run: publicRun(run),
    events: (events.results ?? []).map(event => {
      let details: Record<string, unknown> = {};
      try { details = JSON.parse(event.details_json) as Record<string, unknown>; } catch { /* malformed row */ }
      return {
        type: event.event_type,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        attempt: event.attempt,
        response_status: event.response_status,
        message: event.message,
        details: sanitizeMetrics(details),
        created_at: event.created_at,
      };
    }),
  };
}

export function isIncompleteStatus(status: string): boolean {
  return TERMINAL_INCOMPLETE.includes(status as SyncJobStatus);
}
