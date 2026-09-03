import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import type { Env, HubSpotSyncParams, OrphanCleanupActor } from './types.js';
import { recordPrivilegedActionForActor } from './authorization.js';
import {
  countHubSpotQueueRemaining,
  processHubSpotQueue,
  snapshotHubSpotQueue,
} from './hubspot.js';
import {
  finishSyncJob,
  incrementSyncJobProgress,
  isSyncJobActive,
  markSyncJobRunning,
  recordDailyBudget,
  recordSyncJobEvent,
  startSyncJob,
} from './syncJobs.js';

/** Three HubSpot calls per contact leaves five requests of headroom below 50. */
export const HUBSPOT_SYNC_CHUNK_SIZE = 15;
const WORKFLOW_STEP_LIMIT = 2_000;
const EXTERNAL_REQUEST_LIMIT = 50;
const RETRY_LIMIT = 3;

export interface HubSpotDispatchResult {
  started: boolean;
  jobRunId: string | null;
  workflowInstanceId: string | null;
  expectedItems?: number;
  reason?: 'not_production' | 'binding_unavailable' | 'already_running';
}

function workflowInstanceId(jobRunId: string, chunk: number): string {
  return `hubspot-sync-${jobRunId}-${chunk}`
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 100);
}

async function createWorkflowInstance(env: Env, params: HubSpotSyncParams): Promise<string> {
  if (!env.HUBSPOT_SYNC_WORKFLOW) throw new Error('HubSpot synchronization Workflow binding is unavailable');
  if (!await isSyncJobActive(env.DB, params.jobRunId)) {
    throw new NonRetryableError('HubSpot synchronization job was cancelled');
  }
  const id = workflowInstanceId(params.jobRunId, params.chunk);
  let createdId: string;
  try {
    const instance = await env.HUBSPOT_SYNC_WORKFLOW.create({
      id,
      params,
      retention: { successRetention: '1 day', errorRetention: '3 days' },
    });
    createdId = instance.id;
  } catch (error) {
    try {
      const instance = await env.HUBSPOT_SYNC_WORKFLOW.get(id);
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

async function auditTerminalOutcome(
  env: Env,
  actor: OrphanCleanupActor | undefined,
  outcome: 'succeeded' | 'failed',
): Promise<void> {
  if (!actor) return;
  await recordPrivilegedActionForActor(env, actor, {
    action: 'sync_job.retry',
    targetType: 'sync_job',
    targetId: 'hubspot_contacts',
    outcome,
  }).catch(() => {
    console.error(JSON.stringify({ event: 'privileged_action_audit_failed', action: 'sync_job.retry' }));
  });
}

async function finishHubSpotRun(
  env: Env,
  params: HubSpotSyncParams,
  status: 'succeeded' | 'failed' | 'skipped',
  error?: unknown,
): Promise<void> {
  const run = await env.DB.prepare(`
    SELECT completed_items, failed_items FROM sync_job_runs WHERE id = ?
  `).bind(params.jobRunId).first<{ completed_items: number; failed_items: number }>();
  const completed = Number(run?.completed_items ?? 0);
  const failed = Number(run?.failed_items ?? 0);
  await finishSyncJob(env.DB, params.jobRunId, status, {
    metrics: {
      bounded_workflow: true,
      chunk_size: HUBSPOT_SYNC_CHUNK_SIZE,
      external_request_limit: EXTERNAL_REQUEST_LIMIT,
    },
    completedItems: completed,
    failedItems: failed,
    errorCode: status === 'skipped'
      ? 'configuration_missing'
      : status === 'failed' ? 'hubspot_sync_incomplete' : null,
    error: error ?? (failed > 0 ? `${failed} HubSpot queue item(s) remain eligible for retry.` : undefined),
  });
  await auditTerminalOutcome(env, params.auditActor, status === 'succeeded' ? 'succeeded' : 'failed');
}

export async function initializeHubSpotSyncRun(
  env: Env,
  input: { jobRunId: string; auditActor?: OrphanCleanupActor },
): Promise<{ workflowInstanceId: string; expectedItems: number }> {
  if (!env.HUBSPOT_SYNC_WORKFLOW) throw new Error('HubSpot synchronization Workflow binding is unavailable');
  if (!await isSyncJobActive(env.DB, input.jobRunId)) {
    throw new NonRetryableError('HubSpot synchronization job was cancelled');
  }
  const snapshot = await snapshotHubSpotQueue(env.DB);
  await env.DB.prepare(`
    UPDATE sync_job_runs
       SET status = 'queued', expected_items = ?, completed_items = 0, failed_items = 0
     WHERE id = ? AND status IN ('queued', 'running')
  `).bind(snapshot.count, input.jobRunId).run();
  const workflowInstanceId = await createWorkflowInstance(env, {
    jobRunId: input.jobRunId,
    chunk: 0,
    maxQueueId: snapshot.maxQueueId,
    eligibleAt: snapshot.eligibleAt,
    auditActor: input.auditActor,
  });
  await env.DB.prepare(
    'UPDATE sync_job_runs SET workflow_instance_id = ? WHERE id = ?',
  ).bind(workflowInstanceId, input.jobRunId).run();
  return { workflowInstanceId, expectedItems: snapshot.count };
}

export async function failHubSpotSyncDispatch(
  env: Env,
  input: { jobRunId: string; auditActor?: OrphanCleanupActor },
  error: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await finishHubSpotRun(env, {
    jobRunId: input.jobRunId,
    chunk: 0,
    maxQueueId: 0,
    eligibleAt: now,
    auditActor: input.auditActor,
  }, 'failed', error);
  console.error(JSON.stringify({ event: 'hubspot_sync_dispatch_failed', job_run_id: input.jobRunId }));
}

export async function startHubSpotSync(
  env: Env,
  trigger: 'scheduled' | 'manual',
): Promise<HubSpotDispatchResult> {
  if (env.ENVIRONMENT !== 'production') {
    return { started: false, jobRunId: null, workflowInstanceId: null, reason: 'not_production' };
  }
  if (!env.HUBSPOT_SYNC_WORKFLOW) {
    return { started: false, jobRunId: null, workflowInstanceId: null, reason: 'binding_unavailable' };
  }
  const active = await env.DB.prepare(`
    SELECT id FROM sync_job_runs
     WHERE job_key = 'hubspot_contacts' AND status IN ('queued', 'running')
     ORDER BY started_at DESC LIMIT 1
  `).first<{ id: string }>();
  if (active) {
    return { started: false, jobRunId: active.id, workflowInstanceId: null, reason: 'already_running' };
  }

  const jobRunId = await startSyncJob(env.DB, {
    jobKey: 'hubspot_contacts', trigger, mode: 'live', status: 'queued',
  });
  try {
    const initialized = await initializeHubSpotSyncRun(env, { jobRunId });
    return {
      started: true,
      jobRunId,
      workflowInstanceId: initialized.workflowInstanceId,
      expectedItems: initialized.expectedItems,
    };
  } catch (error) {
    await failHubSpotSyncDispatch(env, { jobRunId }, error);
    throw error;
  }
}

export class HubSpotSyncWorkflow extends WorkflowEntrypoint<Env, HubSpotSyncParams> {
  async run(
    event: WorkflowEvent<HubSpotSyncParams>,
    step: WorkflowStep,
  ): Promise<Record<string, number | boolean>> {
    return step.do('process bounded HubSpot contact chunk', {
      retries: { limit: RETRY_LIMIT, delay: '10 seconds', backoff: 'exponential' },
      timeout: '15 minutes',
    }, async (context): Promise<Record<string, number | boolean>> => {
      let requestCount = 0;
      try {
        if (!await isSyncJobActive(this.env.DB, event.payload.jobRunId)) {
          return {
            done: true,
            cancelled: true,
            processed: 0,
            succeeded: 0,
            failed: 0,
            remaining: 0,
            external_requests: 0,
          };
        }
        await markSyncJobRunning(this.env.DB, event.payload.jobRunId);
        const result = await processHubSpotQueue(this.env, {
          limit: HUBSPOT_SYNC_CHUNK_SIZE,
          maxQueueId: event.payload.maxQueueId,
          eligibleAt: event.payload.eligibleAt,
          fetcher: async (input, init) => {
            requestCount += 1;
            return fetch(input, init);
          },
        });
        await incrementSyncJobProgress(
          this.env.DB,
          event.payload.jobRunId,
          result.succeeded,
          result.failed,
        );
        const remaining = await countHubSpotQueueRemaining(this.env.DB, event.payload);
        await recordSyncJobEvent(this.env.DB, event.payload.jobRunId, {
          type: result.skipped ? 'hubspot_sync_skipped' : 'hubspot_sync_chunk_complete',
          entityType: 'integration_chunk',
          entityId: event.payload.chunk,
          attempt: context.attempt,
          details: {
            chunk: event.payload.chunk,
            processed: result.processed,
            succeeded: result.succeeded,
            failed: result.failed,
            remaining,
            external_requests: requestCount,
          },
        });
        await Promise.all([
          recordDailyBudget(this.env.DB, {
            key: 'workflow_steps', label: 'OASIS Workflow steps', unit: 'steps',
            limit: WORKFLOW_STEP_LIMIT, consumedDelta: 1,
          }),
          recordDailyBudget(this.env.DB, {
            key: 'hubspot_api', label: 'HubSpot API', unit: 'requests',
            consumedDelta: requestCount,
          }),
          recordDailyBudget(this.env.DB, {
            key: 'workflow_external_requests', label: 'Workflow external requests (daily observed)',
            unit: 'requests', consumedDelta: requestCount,
          }),
          recordDailyBudget(this.env.DB, {
            key: 'workflow_external_request_limit', label: 'Peak Workflow instance requests',
            unit: 'requests per instance', limit: EXTERNAL_REQUEST_LIMIT,
            consumedMaximum: requestCount,
            remaining: Math.max(0, EXTERNAL_REQUEST_LIMIT - requestCount),
          }),
        ]);

        if (result.skipped) {
          await finishHubSpotRun(this.env, event.payload, 'skipped');
          return { done: true, processed: 0, succeeded: 0, failed: 0, remaining };
        }
        if (remaining > 0) {
          await createWorkflowInstance(this.env, {
            ...event.payload,
            chunk: event.payload.chunk + 1,
          });
          return { done: false, ...result, remaining, external_requests: requestCount };
        }

        const run = await this.env.DB.prepare(
          'SELECT failed_items FROM sync_job_runs WHERE id = ?',
        ).bind(event.payload.jobRunId).first<{ failed_items: number }>();
        const status = Number(run?.failed_items ?? 0) > 0 ? 'failed' : 'succeeded';
        await finishHubSpotRun(this.env, event.payload, status);
        return { done: true, ...result, remaining: 0, external_requests: requestCount };
      } catch (error) {
        if (error instanceof NonRetryableError) throw error;
        if (context.attempt <= RETRY_LIMIT) throw error;
        await finishHubSpotRun(this.env, event.payload, 'failed', error);
        throw new NonRetryableError(
          error instanceof Error ? error.message : 'Bounded HubSpot synchronization failed',
        );
      }
    });
  }
}
