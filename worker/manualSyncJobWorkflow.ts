import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { Env, ManualSyncJobKey, ManualSyncJobParams, OrphanCleanupActor } from './types.js';
import { recordPrivilegedActionForActor } from './authorization.js';
import { reconcileRemovedRepositories } from './cleanup.js';
import { rebuildContributors, rebuildDuplicates, syncVotesFromComments } from './db.js';
import {
  closeCanonicalDuplicate,
  rebuildReactionDerivedCounts,
  runSyncOneCommentReaction,
  runSyncOneRepo,
  seedCommentReactionWorkItems,
} from './sync.js';
import {
  finishSyncJob,
  incrementSyncJobProgress,
  isSyncJobActive,
  markSyncJobRunning,
  recordDailyBudget,
  recordSyncJobEvent,
} from './syncJobs.js';

const RETRY_LIMIT = 3;
const WORKFLOW_STEP_LIMIT = 2_000;
const COLLECTION_JOBS = new Set<ManualSyncJobKey>([
  'pull_request_catalog',
  'upstream_merge_status',
  'pull_request_comments',
]);

function workflowInstanceId(jobRunId: string, chunk: number): string {
  return `manual-sync-${jobRunId}-${chunk}`.slice(0, 100);
}

async function createWorkflowInstance(env: Env, params: ManualSyncJobParams): Promise<string> {
  if (!env.MANUAL_SYNC_JOB_WORKFLOW) throw new Error('Manual synchronization Workflow binding is unavailable');
  if (!await isSyncJobActive(env.DB, params.jobRunId)) {
    throw new NonRetryableError('Manual synchronization job was cancelled');
  }
  const id = workflowInstanceId(params.jobRunId, params.chunk);
  let createdId: string;
  try {
    const instance = await env.MANUAL_SYNC_JOB_WORKFLOW.create({
      id,
      params,
      retention: { successRetention: '1 day', errorRetention: '3 days' },
    });
    createdId = instance.id;
  } catch (error) {
    try {
      const instance = await env.MANUAL_SYNC_JOB_WORKFLOW.get(id);
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

async function auditOutcome(
  env: Env,
  actor: OrphanCleanupActor,
  jobKey: string,
  outcome: 'succeeded' | 'failed',
): Promise<void> {
  await recordPrivilegedActionForActor(env, actor, {
    action: 'sync_job.retry', targetType: 'sync_job', targetId: jobKey, outcome,
  }).catch(() => {
    console.error(JSON.stringify({ event: 'privileged_action_audit_failed', action: 'sync_job.retry' }));
  });
}

async function finishManualJob(
  env: Env,
  params: ManualSyncJobParams,
  status: 'succeeded' | 'failed',
  metrics: Record<string, unknown> = {},
  error?: unknown,
): Promise<void> {
  const run = await env.DB.prepare(`
    SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?
  `).bind(params.jobRunId).first<{ completed_items: number; failed_items: number }>();
  await finishSyncJob(env.DB, params.jobRunId, status, {
    metrics: { bounded_workflow: true, ...metrics },
    completedItems: Number(run?.completed_items ?? 0),
    failedItems: Number(run?.failed_items ?? 0),
    errorCode: status === 'failed' ? 'manual_job_failed' : null,
    error,
  });
  await env.DB.prepare('DELETE FROM sync_state WHERE key = ?')
    .bind(`manual_sync_cursor:${params.jobRunId}`).run();
  await auditOutcome(env, params.auditActor, `${params.pipeline}:${params.jobKey}`, status);
}

export async function initializeManualSyncJob(
  env: Env,
  input: Omit<ManualSyncJobParams, 'chunk'>,
): Promise<string> {
  if (!env.MANUAL_SYNC_JOB_WORKFLOW) throw new Error('Manual synchronization Workflow binding is unavailable');
  if (!await isSyncJobActive(env.DB, input.jobRunId)) {
    throw new NonRetryableError('Manual synchronization job was cancelled');
  }
  let expectedItems = 0;
  if (input.jobKey === 'comment_reactions') {
    expectedItems = await seedCommentReactionWorkItems(env.DB, input.jobRunId, input.pipelineRunId);
  }
  if (!await isSyncJobActive(env.DB, input.jobRunId)) {
    await env.DB.prepare(`
      UPDATE sync_work_items
         SET status = 'failed', last_error_code = 'cancelled_by_admin',
             last_error_summary = 'Cancelled by an administrator.', updated_at = ?
       WHERE job_run_id = ? AND status IN ('pending', 'leased', 'deferred')
    `).bind(new Date().toISOString(), input.jobRunId).run();
    throw new NonRetryableError('Manual synchronization job was cancelled');
  }
  await env.DB.prepare(`
    UPDATE sync_job_runs SET status = 'queued', expected_items = ?
     WHERE id = ? AND status IN ('queued', 'running')
  `).bind(expectedItems, input.jobRunId).run();
  const workflowId = await createWorkflowInstance(env, { ...input, chunk: 0 });
  await env.DB.prepare('UPDATE sync_job_runs SET workflow_instance_id = ? WHERE id = ?')
    .bind(workflowId, input.jobRunId).run();
  return workflowId;
}

export async function failManualSyncJobDispatch(
  env: Env,
  input: Omit<ManualSyncJobParams, 'chunk'>,
  error: unknown,
): Promise<void> {
  await finishManualJob(env, { ...input, chunk: 0 }, 'failed', {}, error);
}

export async function processManualSyncJobChunk(
  env: Env,
  params: ManualSyncJobParams,
  attempt: number,
): Promise<Record<string, number | boolean>> {
  if (!await isSyncJobActive(env.DB, params.jobRunId)) return { done: true, cancelled: true };
  await markSyncJobRunning(env.DB, params.jobRunId);
  let result: Record<string, number | boolean>;
  let done = true;

  if (params.jobKey === 'repository_inventory') {
    const inventory = await reconcileRemovedRepositories(env);
    if (inventory.errors > 0) throw new Error(`${inventory.errors} repository inventory operation(s) failed`);
    await incrementSyncJobProgress(env.DB, params.jobRunId, inventory.checked);
    result = { checked: inventory.checked, removed: inventory.removed, flagged: inventory.flagged };
  } else if (COLLECTION_JOBS.has(params.jobKey)) {
    const collection = await runSyncOneRepo(env, {
      skipReactions: true,
      deferFinalization: true,
      cursorKey: `manual_sync_cursor:${params.jobRunId}`,
    });
    if (!collection.ok) throw new Error(collection.message);
    const completed = params.jobKey === 'pull_request_comments'
      ? collection.stats.comments
      : collection.stats.prs;
    await incrementSyncJobProgress(env.DB, params.jobRunId, completed);
    done = collection.done === true;
    result = {
      repositories: collection.stats.repos,
      pull_requests: collection.stats.prs,
      comments: collection.stats.comments,
    };
  } else if (params.jobKey === 'comment_reactions') {
    const reactions = await runSyncOneCommentReaction(env, params.pipelineRunId);
    if (!reactions.done) await incrementSyncJobProgress(env.DB, params.jobRunId, 1);
    done = reactions.done;
    if (done) await rebuildReactionDerivedCounts(env.DB);
    result = { reactions: reactions.reactions };
  } else if (params.jobKey === 'vote_projection') {
    await syncVotesFromComments(env.DB);
    const votes = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_votes')
      .first<{ count: number }>();
    await incrementSyncJobProgress(env.DB, params.jobRunId, Number(votes?.count ?? 0));
    result = { votes: Number(votes?.count ?? 0) };
  } else if (params.jobKey === 'duplicate_resolution') {
    if (params.chunk === 0) await rebuildDuplicates(env.DB, env.GITHUB_TOKEN, { skipGitHubMutations: true });
    const duplicate = await closeCanonicalDuplicate(env);
    await incrementSyncJobProgress(env.DB, params.jobRunId, duplicate.closed);
    done = duplicate.done;
    result = { closed: duplicate.closed };
  } else {
    await rebuildContributors(env.DB, new Date().toISOString());
    const contributors = await env.DB.prepare('SELECT COUNT(*) AS count FROM contributors')
      .first<{ count: number }>();
    await incrementSyncJobProgress(env.DB, params.jobRunId, Number(contributors?.count ?? 0));
    result = { contributors: Number(contributors?.count ?? 0) };
  }

  await recordSyncJobEvent(env.DB, params.jobRunId, {
    type: done ? 'manual_job_complete' : 'manual_job_chunk_complete',
    entityType: 'manual_chunk', entityId: params.chunk, attempt,
    details: { chunk: params.chunk, done, ...result },
  });
  await recordDailyBudget(env.DB, {
    key: 'workflow_steps', label: 'OASIS Workflow steps', unit: 'steps',
    limit: WORKFLOW_STEP_LIMIT, consumedDelta: 1,
  });

  if (!done) {
    await createWorkflowInstance(env, { ...params, chunk: params.chunk + 1 });
    return { done: false, ...result };
  }
  await finishManualJob(env, params, 'succeeded', result);
  return { done: true, ...result };
}

export class ManualSyncJobWorkflow extends WorkflowEntrypoint<Env, ManualSyncJobParams> {
  async run(
    event: WorkflowEvent<ManualSyncJobParams>,
    step: WorkflowStep,
  ): Promise<Record<string, number | boolean>> {
    return step.do(`run bounded ${event.payload.jobKey}`, {
      retries: { limit: RETRY_LIMIT, delay: '10 seconds', backoff: 'exponential' },
      timeout: '15 minutes',
    }, async context => {
      try {
        return await processManualSyncJobChunk(this.env, event.payload, context.attempt);
      } catch (error) {
        if (error instanceof NonRetryableError) throw error;
        if (context.attempt <= RETRY_LIMIT) throw error;
        await finishManualJob(this.env, event.payload, 'failed', {}, error);
        throw new NonRetryableError(error instanceof Error ? error.message : 'Manual synchronization job failed');
      }
    });
  }
}
