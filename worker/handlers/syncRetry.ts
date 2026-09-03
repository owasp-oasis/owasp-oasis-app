import type { Env } from '../types.js';
import { roleAllows, getRequestPrincipal, recordPrivilegedAction } from '../authorization.js';
import { reconcileRemovedRepositories } from '../cleanup.js';
import { processHubSpotQueue } from '../hubspot.js';
import { failOrphanCleanupDispatch, initializeOrphanCleanupRun } from '../orphanCleanupWorkflow.js';
import { jsonErr, secHeaders, validateCSRF } from '../security.js';
import { finishSyncJob, markSyncJobRunning, startSyncJob, type SyncJobStatus } from '../syncJobs.js';

const RETRYABLE_JOB_KEYS = new Set([
  'repository_inventory',
  'orphan_cleanup',
  'hubspot_contacts',
]);

interface RetryTarget {
  id: string;
}

async function finishRepositoryInventory(env: Env, runId: string): Promise<SyncJobStatus> {
  const result = await reconcileRemovedRepositories(env);
  const status = result.errors > 0 ? 'failed' : 'succeeded';
  await finishSyncJob(env.DB, runId, status, {
    metrics: {
      checked: result.checked,
      removed: result.removed,
      flagged: result.flagged,
      errors: result.errors,
    },
    completedItems: result.checked,
    failedItems: result.errors,
    errorCode: result.errors > 0 ? 'repository_reconciliation_failed' : null,
    error: result.errors > 0 ? `${result.errors} repository reconciliation operation(s) failed.` : undefined,
  });
  return status;
}

async function finishHubSpotContacts(env: Env, runId: string): Promise<SyncJobStatus> {
  const result = await processHubSpotQueue(env, { limit: 25 });
  const status = result.skipped ? 'skipped' : result.failed > 0 ? 'failed' : 'succeeded';
  await finishSyncJob(env.DB, runId, status, {
    metrics: result,
    completedItems: result.succeeded,
    failedItems: result.failed,
    errorCode: result.skipped ? 'configuration_missing' : result.failed > 0 ? 'queue_items_failed' : null,
    error: result.skipped
      ? 'HubSpot synchronization was skipped because a required binding was unavailable.'
      : result.failed > 0
        ? `${result.failed} HubSpot queue item(s) failed and remain eligible for retry.`
        : undefined,
  });
  return status;
}

async function executeRetry(
  env: Env,
  jobKey: string,
  runId: string,
  principal: Awaited<ReturnType<typeof getRequestPrincipal>>,
): Promise<void> {
  let outcome: 'succeeded' | 'failed';
  try {
    await markSyncJobRunning(env.DB, runId);
    let status: SyncJobStatus;
    if (jobKey === 'repository_inventory') status = await finishRepositoryInventory(env, runId);
    else if (jobKey === 'hubspot_contacts') status = await finishHubSpotContacts(env, runId);
    else throw new Error('Unsupported sync job retry');
    outcome = status === 'succeeded' ? 'succeeded' : 'failed';
  } catch (error) {
    try {
      await finishSyncJob(env.DB, runId, 'failed', {
        errorCode: 'manual_retry_failed',
        error,
      });
    } catch { /* retain the original failure */ }
    outcome = 'failed';
    console.error(JSON.stringify({ event: 'sync_job_manual_retry_failed', job_key: jobKey }));
  }
  await recordPrivilegedAction(env, principal, {
    action: 'sync_job.retry', targetType: 'sync_job', targetId: jobKey, outcome,
  }).catch(() => {
    console.error(JSON.stringify({ event: 'privileged_action_audit_failed', action: 'sync_job.retry' }));
  });
}

export async function handleRetrySyncJob(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  jobKey: string,
): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required', 403, request);
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  if (env.ENVIRONMENT !== 'production') {
    return jsonErr('Sync job retries are production-only', 409, request);
  }
  if (!RETRYABLE_JOB_KEYS.has(jobKey)) return jsonErr('This sync job does not support manual retry', 409, request);

  const active = await env.DB.prepare(`
    SELECT id FROM sync_job_runs
     WHERE job_key = ? AND status IN ('queued', 'running')
     ORDER BY started_at DESC LIMIT 1
  `).bind(jobKey).first<{ id: string }>();
  if (active) return jsonErr('This sync job is already running', 409, request);

  const target = await env.DB.prepare(`
    SELECT id FROM sync_job_runs
     WHERE job_key = ? ORDER BY started_at DESC LIMIT 1
  `).bind(jobKey).first<RetryTarget>();

  const retryRunId = await startSyncJob(env.DB, {
    jobKey,
    trigger: 'manual',
    mode: 'live',
    status: 'queued',
  });
  try {
    await recordPrivilegedAction(env, principal, {
      action: 'sync_job.retry', targetType: 'sync_job', targetId: jobKey, outcome: 'accepted',
    });
  } catch {
    await finishSyncJob(env.DB, retryRunId, 'failed', {
      errorCode: 'privileged_action_audit_failed',
      error: 'The retry was not started because its privileged action audit could not be recorded.',
    }).catch(() => undefined);
    return jsonErr('Unable to record privileged action', 500, request);
  }
  if (jobKey === 'orphan_cleanup') {
    const params = {
      jobRunId: retryRunId,
      pipelineRunId: retryRunId,
      auditActor: {
        githubUserId: principal.session.github_user_id,
        githubLogin: principal.session.github_login,
        role: principal.role,
      },
    };
    ctx.waitUntil(
      initializeOrphanCleanupRun(env, params)
        .catch(error => failOrphanCleanupDispatch(env, params, error)),
    );
  } else {
    ctx.waitUntil(executeRetry(env, jobKey, retryRunId, principal));
  }

  return secHeaders(Response.json({
    ok: true,
    accepted: true,
    job_key: jobKey,
    retried_run_id: target?.id ?? null,
    retry_run_id: retryRunId,
  }, { status: 202 }), request);
}
