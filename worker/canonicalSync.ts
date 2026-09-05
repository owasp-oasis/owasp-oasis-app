import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { CanonicalSyncParams, Env, SyncResult, WorkspacePipelineKind } from './types.js';
import { reconcileRemovedRepositories } from './cleanup.js';
import {
  closeCanonicalDuplicate,
  finalizeCanonicalSync,
  prepareCanonicalProjections,
  runSyncOneCommentReaction,
  runSyncOneRepo,
  seedCommentReactionWorkItems,
} from './sync.js';
import {
  finishSyncJob,
  incrementSyncJobProgress,
  interruptExpiredSyncJobs,
  isSyncJobActive,
  markSyncJobRunning,
  pruneSyncJobHistory,
  recordDailyBudget,
  recordSyncJobEvent,
  startSyncJob,
} from './syncJobs.js';

const CANONICAL_LOCK = 'canonical_workspace_sync';
const LOCK_LEASE_MS = 30 * 60_000;
const WORKFLOW_STEP_LIMIT = 2_000;
const WORKFLOW_STEP_PAUSE_AT = 1_800;
const RETRY_LIMIT = 3;

const PIPELINE_JOB_KEYS = [
  'pull_request_catalog',
  'upstream_merge_status',
  'pull_request_comments',
  'comment_reactions',
  'vote_projection',
  'duplicate_resolution',
  'contributor_scores',
  'orphan_cleanup',
] as const;

export interface CanonicalDispatchResult {
  started: boolean;
  pipelineRunId: string | null;
  workflowInstanceId: string | null;
  reason?: 'not_production' | 'binding_unavailable' | 'already_running';
}

function nowIso(): string {
  return new Date().toISOString();
}

async function setPipelineState(
  db: D1Database,
  pipelineRunId: string,
  phase: string,
  pipelineKind: WorkspacePipelineKind,
): Promise<void> {
  const now = nowIso();
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('canonical_pipeline_run_id', ?)")
      .bind(pipelineRunId),
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('canonical_pipeline_phase', ?)")
      .bind(phase),
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('canonical_pipeline_updated_at', ?)")
      .bind(now),
    db.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('workspace_pipeline_kind', ?)")
      .bind(pipelineKind),
  ]);
}

async function acquirePipelineLock(db: D1Database, pipelineRunId: string): Promise<boolean> {
  const now = nowIso();
  await db.prepare(
    'DELETE FROM sync_pipeline_locks WHERE lock_key = ? AND lease_expires_at <= ?',
  ).bind(CANONICAL_LOCK, now).run();
  const result = await db.prepare(`
    INSERT OR IGNORE INTO sync_pipeline_locks (
      lock_key, pipeline_run_id, acquired_at, lease_expires_at
    ) VALUES (?, ?, ?, ?)
  `).bind(
    CANONICAL_LOCK,
    pipelineRunId,
    now,
    new Date(Date.now() + LOCK_LEASE_MS).toISOString(),
  ).run();
  return (result.meta.changes ?? 0) === 1;
}

async function renewPipelineLock(
  db: D1Database,
  pipelineRunId: string,
  pipelineKind: WorkspacePipelineKind,
): Promise<void> {
  const result = await db.prepare(`
    UPDATE sync_pipeline_locks
       SET lease_expires_at = ?
     WHERE lock_key = ? AND pipeline_run_id = ?
  `).bind(
    new Date(Date.now() + LOCK_LEASE_MS).toISOString(),
    CANONICAL_LOCK,
    pipelineRunId,
  ).run();
  if ((result.meta.changes ?? 0) !== 1) {
    throw new Error('Workspace synchronization lease is no longer owned by this pipeline');
  }
  await setPipelineState(db, pipelineRunId, 'running', pipelineKind);
}

async function releasePipelineLock(
  db: D1Database,
  pipelineRunId: string,
  phase: string,
  pipelineKind: WorkspacePipelineKind,
): Promise<void> {
  await db.prepare(
    'DELETE FROM sync_pipeline_locks WHERE lock_key = ? AND pipeline_run_id = ?',
  ).bind(CANONICAL_LOCK, pipelineRunId).run();
  await setPipelineState(db, pipelineRunId, phase, pipelineKind);
}

async function jobRunId(db: D1Database, pipelineRunId: string, jobKey: string): Promise<string> {
  const row = await db.prepare(`
    SELECT id FROM sync_job_runs
     WHERE pipeline_run_id = ? AND job_key = ?
     ORDER BY created_at LIMIT 1
  `).bind(pipelineRunId, jobKey).first<{ id: string }>();
  if (!row) throw new Error(`Missing Workspace synchronization job run: ${jobKey}`);
  return row.id;
}

function pipelineKind(params: CanonicalSyncParams): WorkspacePipelineKind {
  return params.pipelineKind ?? 'canonical';
}

function parentJobKey(kind: WorkspacePipelineKind): 'legacy_workspace_sync' | 'canonical_workspace_sync' {
  return kind === 'legacy' ? 'legacy_workspace_sync' : 'canonical_workspace_sync';
}

async function parentRunId(
  db: D1Database,
  pipelineRunId: string,
  kind: WorkspacePipelineKind,
): Promise<string> {
  return jobRunId(db, pipelineRunId, parentJobKey(kind));
}

function workflowInstanceId(pipelineRunId: string, suffix: string): string {
  return `workspace-${pipelineRunId.slice(0, 8)}-${suffix}`
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 100);
}

async function continueCanonical(
  env: Env,
  params: CanonicalSyncParams,
  suffix: string,
): Promise<string> {
  if (!env.CANONICAL_SYNC_WORKFLOW) throw new Error('Workspace synchronization Workflow binding is unavailable');
  const parent = await env.DB.prepare(`
    SELECT id FROM sync_job_runs
     WHERE pipeline_run_id = ?
       AND job_key IN ('legacy_workspace_sync', 'canonical_workspace_sync')
     ORDER BY created_at LIMIT 1
  `).bind(params.pipelineRunId).first<{ id: string }>();
  if (!parent || !await isSyncJobActive(env.DB, parent.id)) {
    throw new NonRetryableError('Workspace synchronization was cancelled');
  }
  const id = workflowInstanceId(params.pipelineRunId, suffix);
  let createdId: string;
  try {
    const instance = await env.CANONICAL_SYNC_WORKFLOW.create({
      id,
      params,
      retention: { successRetention: '1 day', errorRetention: '3 days' },
    });
    createdId = instance.id;
  } catch (error) {
    try {
      const instance = await env.CANONICAL_SYNC_WORKFLOW.get(id);
      createdId = instance.id;
    } catch {
      throw error;
    }
  }
  await env.DB.prepare(`
    UPDATE sync_job_runs SET workflow_instance_id = ?
     WHERE pipeline_run_id = ? AND status IN ('queued', 'running')
  `).bind(createdId, params.pipelineRunId).run();
  return createdId;
}

async function createPipelineJobs(
  env: Env,
  pipelineRunId: string,
  trigger: 'scheduled' | 'manual',
  kind: WorkspacePipelineKind,
): Promise<void> {
  await startSyncJob(env.DB, {
    jobKey: parentJobKey(kind),
    pipelineRunId,
    trigger,
    mode: kind === 'legacy' ? 'legacy' : 'live',
  });
  await startSyncJob(env.DB, {
    jobKey: 'repository_inventory',
    pipelineRunId,
    trigger,
    mode: kind === 'legacy' ? 'legacy' : 'live',
    status: 'queued',
  });
  for (const jobKey of PIPELINE_JOB_KEYS) {
    await startSyncJob(env.DB, {
      jobKey,
      pipelineRunId,
      trigger: 'continuation',
      mode: kind === 'legacy' ? 'legacy' : 'live',
      status: 'queued',
    });
  }
}

export async function canonicalScheduleEnabled(db: D1Database): Promise<boolean> {
  const row = await db.prepare(
    "SELECT value FROM sync_state WHERE key = 'canonical_sync_enabled'",
  ).first<{ value: string }>();
  return row?.value === '1';
}

export async function setCanonicalScheduleEnabled(db: D1Database, enabled: boolean): Promise<void> {
  await db.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('canonical_sync_enabled', ?)",
  ).bind(enabled ? '1' : '0').run();
}

export async function canonicalCutoverEligible(db: D1Database): Promise<boolean> {
  const row = await db.prepare(`
    SELECT eligible_for_cutover, consecutive_matches
      FROM sync_parity_runs
     ORDER BY created_at DESC LIMIT 1
  `).first<{ eligible_for_cutover: number; consecutive_matches: number }>();
  return row?.eligible_for_cutover === 1 && row.consecutive_matches >= 3;
}

async function startWorkspaceSync(
  env: Env,
  trigger: 'scheduled' | 'manual',
  kind: WorkspacePipelineKind,
): Promise<CanonicalDispatchResult> {
  if (env.ENVIRONMENT !== 'production') {
    return { started: false, pipelineRunId: null, workflowInstanceId: null, reason: 'not_production' };
  }
  if (!env.CANONICAL_SYNC_WORKFLOW) {
    return { started: false, pipelineRunId: null, workflowInstanceId: null, reason: 'binding_unavailable' };
  }

  await interruptExpiredSyncJobs(env.DB);
  await pruneSyncJobHistory(env.DB);
  const pipelineRunId = crypto.randomUUID();
  if (!await acquirePipelineLock(env.DB, pipelineRunId)) {
    const active = await env.DB.prepare(
      'SELECT pipeline_run_id FROM sync_pipeline_locks WHERE lock_key = ?',
    ).bind(CANONICAL_LOCK).first<{ pipeline_run_id: string }>();
    return {
      started: false,
      pipelineRunId: active?.pipeline_run_id ?? null,
      workflowInstanceId: null,
      reason: 'already_running',
    };
  }

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sync_state WHERE key = 'sync_cursor'"),
      env.DB.prepare("INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')"),
    ]);
    await setPipelineState(env.DB, pipelineRunId, 'dispatching', kind);
    await createPipelineJobs(env, pipelineRunId, trigger, kind);
    const workflowId = await continueCanonical(
      env,
      { action: 'inventory', pipelineRunId, pipelineKind: kind },
      `${kind}-inventory`,
    );
    return { started: true, pipelineRunId, workflowInstanceId: workflowId };
  } catch (error) {
    try {
      const parent = await parentRunId(env.DB, pipelineRunId, kind);
      await finishSyncJob(env.DB, parent, 'failed', {
        errorCode: 'workspace_dispatch_failed',
        error,
      });
    } catch { /* pipeline job creation itself failed */ }
    await env.DB.prepare(
      "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '0')",
    ).run();
    await releasePipelineLock(env.DB, pipelineRunId, 'failed', kind);
    throw error;
  }
}

export async function startCanonicalSync(
  env: Env,
  trigger: 'scheduled' | 'manual',
): Promise<CanonicalDispatchResult> {
  return startWorkspaceSync(env, trigger, 'canonical');
}

export async function startBoundedLegacySync(
  env: Env,
  trigger: 'scheduled' | 'manual' = 'scheduled',
): Promise<CanonicalDispatchResult> {
  return startWorkspaceSync(env, trigger, 'legacy');
}

async function failPipeline(
  env: Env,
  pipelineRunId: string,
  kind: WorkspacePipelineKind,
  error: unknown,
): Promise<void> {
  const parent = await parentRunId(env.DB, pipelineRunId, kind);
  await finishSyncJob(env.DB, parent, 'failed', {
    errorCode: 'workspace_pipeline_failed',
    error,
  });
  await env.DB.prepare(
    "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '0')",
  ).run();
  await releasePipelineLock(env.DB, pipelineRunId, 'failed', kind);
}

async function processInventory(
  env: Env,
  params: Extract<CanonicalSyncParams, { action: 'inventory' }>,
  attempt: number,
): Promise<Record<string, number>> {
  const { pipelineRunId } = params;
  const kind = pipelineKind(params);
  await renewPipelineLock(env.DB, pipelineRunId, kind);
  await setPipelineState(env.DB, pipelineRunId, 'repository_inventory', kind);
  const inventoryRunId = await jobRunId(env.DB, pipelineRunId, 'repository_inventory');
  await markSyncJobRunning(env.DB, inventoryRunId);
  const result = await reconcileRemovedRepositories(env);
  if (result.errors > 0) {
    const error = new Error(`${result.errors} repository inventory operation(s) failed`);
    await recordSyncJobEvent(env.DB, inventoryRunId, {
      type: 'repository_inventory_failed',
      attempt,
      message: error.message,
      details: { errors: result.errors },
    });
    throw error;
  }
  await finishSyncJob(env.DB, inventoryRunId, 'succeeded', {
    metrics: {
      checked: result.checked,
      removed: result.removed,
      flagged: result.flagged,
    },
    completedItems: result.checked,
  });
  for (const key of ['pull_request_catalog', 'upstream_merge_status', 'pull_request_comments']) {
    await markSyncJobRunning(env.DB, await jobRunId(env.DB, pipelineRunId, key));
  }
  await continueCanonical(
    env,
    { action: 'sync', pipelineRunId, pipelineKind: kind },
    `${kind}-sync-start`,
  );
  return { repositories: result.checked };
}

async function finishProjectionJobs(env: Env, pipelineRunId: string): Promise<void> {
  for (const jobKey of ['vote_projection', 'duplicate_resolution', 'contributor_scores']) {
    const id = await jobRunId(env.DB, pipelineRunId, jobKey);
    await markSyncJobRunning(env.DB, id);
    const progress = await env.DB.prepare(
      'SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?',
    ).bind(id).first<{ completed_items: number; failed_items: number }>();
    await finishSyncJob(env.DB, id, 'succeeded', {
      metrics: { incremental: true },
      completedItems: progress?.completed_items ?? 0,
      failedItems: progress?.failed_items ?? 0,
    });
  }
  const cleanupId = await jobRunId(env.DB, pipelineRunId, 'orphan_cleanup');
  await markSyncJobRunning(env.DB, cleanupId);
  await finishSyncJob(env.DB, cleanupId, 'succeeded', { metrics: { inventory_based: true } });
}

async function processSyncChunk(
  env: Env,
  params: Extract<CanonicalSyncParams, { action: 'sync' }>,
  attempt: number,
): Promise<Record<string, number | boolean>> {
  const { pipelineRunId } = params;
  const kind = pipelineKind(params);
  await renewPipelineLock(env.DB, pipelineRunId, kind);
  await setPipelineState(env.DB, pipelineRunId, 'pull_request_collection', kind);
  const reactionJobRunId = await jobRunId(env.DB, pipelineRunId, 'comment_reactions');
  const result: SyncResult = await runSyncOneRepo(env, {
    skipReactions: true,
    reactionJobRunId,
    pipelineRunId,
    deferFinalization: true,
  });
  const catalogId = await jobRunId(env.DB, pipelineRunId, 'pull_request_catalog');
  const commentId = await jobRunId(env.DB, pipelineRunId, 'pull_request_comments');

  await recordSyncJobEvent(env.DB, catalogId, {
    type: result.ok ? 'canonical_chunk_complete' : 'canonical_chunk_failed',
    attempt,
    message: result.message,
    details: {
      repositories: result.stats.repos,
      pull_requests: result.stats.prs,
      comments: result.stats.comments,
      done: result.done === true,
    },
  });
  if (!result.ok) throw new Error(result.message);

  await incrementSyncJobProgress(env.DB, catalogId, result.stats.repos);
  await incrementSyncJobProgress(env.DB, commentId, result.stats.prs);

  if (!result.done) {
    await continueCanonical(
      env,
      { action: 'sync', pipelineRunId, pipelineKind: kind },
      `${kind}-sync-${result.cursor ?? crypto.randomUUID()}`,
    );
    return { done: false, pull_requests: result.stats.prs };
  }

  for (const jobKey of ['pull_request_catalog', 'upstream_merge_status', 'pull_request_comments']) {
    const id = await jobRunId(env.DB, pipelineRunId, jobKey);
    const progress = await env.DB.prepare(
      'SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?',
    ).bind(id).first<{ completed_items: number; failed_items: number }>();
    await finishSyncJob(env.DB, id, 'succeeded', {
      metrics: { incremental: true },
      completedItems: progress?.completed_items ?? 0,
      failedItems: progress?.failed_items ?? 0,
    });
  }
  const expectedReactions = await seedCommentReactionWorkItems(
    env.DB,
    reactionJobRunId,
    pipelineRunId,
  );
  await markSyncJobRunning(env.DB, reactionJobRunId, expectedReactions);
  await recordSyncJobEvent(env.DB, reactionJobRunId, {
    type: 'reaction_inventory_seeded',
    details: { comments: expectedReactions },
  });
  await continueCanonical(
    env,
    { action: 'reaction', pipelineRunId, pipelineKind: kind },
    `${kind}-reaction-start`,
  );
  return { done: false, pull_requests: result.stats.prs };
}

async function processReactionChunk(
  env: Env,
  params: Extract<CanonicalSyncParams, { action: 'reaction' }>,
  attempt: number,
): Promise<Record<string, number | boolean>> {
  const { pipelineRunId } = params;
  const kind = pipelineKind(params);
  await renewPipelineLock(env.DB, pipelineRunId, kind);
  await setPipelineState(env.DB, pipelineRunId, 'comment_reactions', kind);
  const reactionId = await jobRunId(env.DB, pipelineRunId, 'comment_reactions');
  const result = await runSyncOneCommentReaction(env, pipelineRunId);
  await recordSyncJobEvent(env.DB, reactionId, {
    type: result.done ? 'reaction_queue_complete' : 'comment_reactions_collected',
    attempt,
    details: { reactions: result.reactions, done: result.done },
  });
  if (!result.done) {
    await incrementSyncJobProgress(env.DB, reactionId, 1);
    await continueCanonical(
      env,
      { action: 'reaction', pipelineRunId, pipelineKind: kind },
      `${kind}-reaction-${crypto.randomUUID()}`,
    );
    return { done: false, reactions: result.reactions };
  }

  const progress = await env.DB.prepare(
    'SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?',
  ).bind(reactionId).first<{ completed_items: number; failed_items: number }>();
  await finishSyncJob(env.DB, reactionId, 'succeeded', {
    metrics: { one_comment_per_workflow: true },
    completedItems: progress?.completed_items ?? 0,
    failedItems: progress?.failed_items ?? 0,
  });
  await prepareCanonicalProjections(env);
  await continueCanonical(
    env,
    { action: 'duplicate', pipelineRunId, pipelineKind: kind },
    `${kind}-duplicate-start`,
  );
  return { done: false, reactions: 0 };
}

async function processDuplicateChunk(
  env: Env,
  params: Extract<CanonicalSyncParams, { action: 'duplicate' }>,
  attempt: number,
): Promise<Record<string, number | boolean>> {
  const { pipelineRunId } = params;
  const kind = pipelineKind(params);
  await renewPipelineLock(env.DB, pipelineRunId, kind);
  await setPipelineState(env.DB, pipelineRunId, 'duplicate_resolution', kind);
  const duplicateId = await jobRunId(env.DB, pipelineRunId, 'duplicate_resolution');
  await markSyncJobRunning(env.DB, duplicateId);
  const result = await closeCanonicalDuplicate(env);
  await recordSyncJobEvent(env.DB, duplicateId, {
    type: result.done ? 'duplicate_closure_complete' : 'duplicate_closed',
    attempt,
    details: { closed: result.closed, done: result.done },
  });
  if (!result.done) {
    await incrementSyncJobProgress(env.DB, duplicateId, result.closed);
    await continueCanonical(
      env,
      { action: 'duplicate', pipelineRunId, pipelineKind: kind },
      `${kind}-duplicate-${crypto.randomUUID()}`,
    );
    return { done: false, closed: result.closed };
  }

  await finalizeCanonicalSync(env);
  await finishProjectionJobs(env, pipelineRunId);
  const parent = await parentRunId(env.DB, pipelineRunId, kind);
  await finishSyncJob(env.DB, parent, 'succeeded', {
    metrics: { bounded_workflow: true },
  });
  await releasePipelineLock(env.DB, pipelineRunId, 'succeeded', kind);
  await pruneSyncJobHistory(env.DB);
  return { done: true, reactions: 0 };
}

export class CanonicalSyncWorkflow extends WorkflowEntrypoint<Env, CanonicalSyncParams> {
  async run(
    event: WorkflowEvent<CanonicalSyncParams>,
    step: WorkflowStep,
  ): Promise<Record<string, number | boolean>> {
    const kind = pipelineKind(event.payload);
    const parent = await parentRunId(this.env.DB, event.payload.pipelineRunId, kind);
    if (!await isSyncJobActive(this.env.DB, parent)) return { done: true, cancelled: true };
    const today = nowIso().slice(0, 10);
    const budget = await this.env.DB.prepare(`
      SELECT consumed FROM sync_daily_budgets
       WHERE budget_date = ? AND budget_key = 'workflow_steps'
    `).bind(today).first<{ consumed: number }>();
    if ((budget?.consumed ?? 0) >= WORKFLOW_STEP_PAUSE_AT) {
      const resumeAt = new Date();
      resumeAt.setUTCDate(resumeAt.getUTCDate() + 1);
      resumeAt.setUTCHours(0, 5, 0, 0);
      const extendedLease = new Date(resumeAt.getTime() + LOCK_LEASE_MS).toISOString();
      const lease = await this.env.DB.prepare(`
        UPDATE sync_pipeline_locks
           SET lease_expires_at = ?
         WHERE lock_key = ? AND pipeline_run_id = ?
      `).bind(extendedLease, CANONICAL_LOCK, event.payload.pipelineRunId).run();
      if ((lease.meta.changes ?? 0) !== 1) {
        const error = new Error('Workspace synchronization lease was lost before budget pause');
        await failPipeline(this.env, event.payload.pipelineRunId, kind, error);
        throw new NonRetryableError(error.message);
      }
      await setPipelineState(
        this.env.DB,
        event.payload.pipelineRunId,
        'paused_for_daily_budget',
        kind,
      );
      await step.sleepUntil('wait for daily Workflow step budget reset', resumeAt);
    }
    return step.do('process bounded Workspace sync work', {
      retries: { limit: RETRY_LIMIT, delay: '10 seconds', backoff: 'exponential' },
      timeout: '15 minutes',
    }, async context => {
      try {
        const result = event.payload.action === 'inventory'
          ? await processInventory(this.env, event.payload, context.attempt)
          : event.payload.action === 'sync'
            ? await processSyncChunk(this.env, event.payload, context.attempt)
            : event.payload.action === 'reaction'
              ? await processReactionChunk(this.env, event.payload, context.attempt)
              : await processDuplicateChunk(this.env, event.payload, context.attempt);
        await recordDailyBudget(this.env.DB, {
          key: 'workflow_steps',
          label: 'OASIS Workflow steps',
          unit: 'steps',
          limit: WORKFLOW_STEP_LIMIT,
          consumedDelta: 1,
        });
        return result;
      } catch (error) {
        if (error instanceof NonRetryableError) throw error;
        if (context.attempt <= RETRY_LIMIT) throw error;
        await failPipeline(this.env, event.payload.pipelineRunId, kind, error);
        throw new NonRetryableError(error instanceof Error ? error.message : 'Workspace pipeline failed');
      }
    });
  }
}
