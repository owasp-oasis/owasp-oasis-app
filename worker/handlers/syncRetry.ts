import type { Env, ManualSyncJobKey, OrphanCleanupActor } from '../types.js';
import { roleAllows, getRequestPrincipal, recordPrivilegedAction } from '../authorization.js';
import { startCanonicalSync } from '../canonicalSync.js';
import { failHubSpotSyncDispatch, initializeHubSpotSyncRun } from '../hubSpotSyncWorkflow.js';
import { failManualSyncJobDispatch, initializeManualSyncJob } from '../manualSyncJobWorkflow.js';
import { failOrphanCleanupDispatch, initializeOrphanCleanupRun } from '../orphanCleanupWorkflow.js';
import { jsonErr, secHeaders, validateCSRF } from '../security.js';
import { finishSyncJob, startSyncJob } from '../syncJobs.js';
import { runAnalyticsCollector, runHistoricalAnalyticsBackfill } from '../analytics.js';

const MANUAL_JOB_KEYS = new Set<ManualSyncJobKey>([
  'repository_inventory',
  'pull_request_catalog',
  'upstream_merge_status',
  'pull_request_comments',
  'comment_reactions',
  'vote_projection',
  'duplicate_resolution',
  'contributor_scores',
]);
const PARENT_JOB_KEYS = new Set([
  'canonical_workspace_sync',
]);
const ANALYTICS_JOB_KEYS = new Set([
  'cloudflare_analytics',
  'cloudflare_analytics_backfill',
]);
const TRIGGERABLE_JOB_KEYS = new Set([
  ...MANUAL_JOB_KEYS,
  ...PARENT_JOB_KEYS,
  'orphan_cleanup',
  'hubspot_contacts',
  'cloudflare_analytics',
  'cloudflare_analytics_backfill',
]);
type PipelineTarget = 'canonical' | 'integration' | 'analytics';

interface RetryTarget { id: string }

function isPipelineTarget(value: unknown): value is PipelineTarget {
  return value === 'canonical' || value === 'integration' || value === 'analytics';
}

async function requestedPipeline(request: Request, jobKey: string): Promise<PipelineTarget> {
  let value: unknown;
  try {
    value = (await request.clone().json<{ pipeline?: unknown }>()).pipeline;
  } catch { /* Existing clients may send an empty body. */ }
  if (isPipelineTarget(value)) return value;
  if (jobKey === 'hubspot_contacts') return 'integration';
  if (ANALYTICS_JOB_KEYS.has(jobKey)) return 'analytics';
  return 'canonical';
}

function actorFor(principal: Awaited<ReturnType<typeof getRequestPrincipal>>): OrphanCleanupActor {
  if (!principal.session) throw new Error('Authenticated principal required');
  return {
    githubUserId: principal.session.github_user_id,
    githubLogin: principal.session.github_login,
    role: principal.role,
  };
}

async function latestRunId(env: Env, jobKey: string, mode?: string): Promise<string | null> {
  const statement = mode
    ? env.DB.prepare(`
        SELECT id FROM sync_job_runs WHERE job_key = ? AND mode = ?
         ORDER BY started_at DESC LIMIT 1
      `).bind(jobKey, mode)
    : env.DB.prepare(`
        SELECT id FROM sync_job_runs WHERE job_key = ?
         ORDER BY started_at DESC LIMIT 1
      `).bind(jobKey);
  const scoped = (await statement.first<RetryTarget>())?.id ?? null;
  if (scoped || !mode) return scoped;
  return (await env.DB.prepare(`
    SELECT id FROM sync_job_runs WHERE job_key = ? ORDER BY started_at DESC LIMIT 1
  `).bind(jobKey).first<RetryTarget>())?.id ?? null;
}

async function activeManualWorkspaceRun(env: Env): Promise<string | null> {
  const run = await env.DB.prepare(`
    SELECT id FROM sync_job_runs
     WHERE category = 'workspace' AND trigger_type = 'manual'
       AND status IN ('queued', 'running')
     ORDER BY started_at DESC LIMIT 1
  `).first<{ id: string }>();
  return run?.id ?? null;
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
  if (env.ENVIRONMENT !== 'production') return jsonErr('Sync job triggers are production-only', 409, request);
  if (!TRIGGERABLE_JOB_KEYS.has(jobKey)) return jsonErr('This job is not currently runnable', 409, request);

  const pipeline = await requestedPipeline(request, jobKey);
  const pipelineMismatch =
    (jobKey === 'canonical_workspace_sync' && pipeline !== 'canonical')
    || (jobKey === 'hubspot_contacts' && pipeline !== 'integration')
    || (ANALYTICS_JOB_KEYS.has(jobKey) && pipeline !== 'analytics')
    || (pipeline === 'integration' && jobKey !== 'hubspot_contacts')
    || (pipeline === 'analytics' && !ANALYTICS_JOB_KEYS.has(jobKey));
  if (pipelineMismatch) return jsonErr('Job does not belong to the requested pipeline', 400, request);
  const mode = 'live';
  const retriedRunId = await latestRunId(env, jobKey, mode);

  if (jobKey === 'canonical_workspace_sync') {
    if (await activeManualWorkspaceRun(env)) {
      return jsonErr('Another manually triggered Workspace job is already running', 409, request);
    }
    await recordPrivilegedAction(env, principal, {
      action: 'sync_job.retry', targetType: 'sync_job', targetId: `${pipeline}:${jobKey}`, outcome: 'accepted',
    });
    const dispatch = await startCanonicalSync(env, 'manual');
    return secHeaders(Response.json({
      ok: dispatch.started,
      accepted: dispatch.started,
      job_key: jobKey,
      pipeline,
      retried_run_id: retriedRunId,
      pipeline_run_id: dispatch.pipelineRunId,
      workflow_instance_id: dispatch.workflowInstanceId,
      reason: dispatch.reason,
      execution_scope: 'workspace_pipeline',
    }, { status: dispatch.started ? 202 : 409 }), request);
  }

  if (ANALYTICS_JOB_KEYS.has(jobKey)) {
    const active = await env.DB.prepare(`
      SELECT id FROM sync_job_runs
       WHERE job_key = ? AND mode = 'live'
         AND status IN ('queued', 'running')
       ORDER BY started_at DESC LIMIT 1
    `).bind(jobKey).first<{ id: string }>();
    if (active) return jsonErr('This analytics collection job is already running', 409, request);
    await recordPrivilegedAction(env, principal, {
      action: 'sync_job.retry', targetType: 'sync_job', targetId: `analytics:${jobKey}`, outcome: 'accepted',
    });
    const result = jobKey === 'cloudflare_analytics'
      ? await runAnalyticsCollector(env, 'manual')
      : await runHistoricalAnalyticsBackfill(env, 'manual');
    return secHeaders(Response.json({
      ok: true,
      accepted: true,
      job_key: jobKey,
      pipeline,
      retried_run_id: retriedRunId,
      retry_run_id: result.job_run_id,
      configuration_required: result.configuration_required,
      execution_scope: 'analytics_collection',
    }, { status: 202 }), request);
  }

  if (pipeline !== 'integration') {
    const workspaceLock = await env.DB.prepare(`
      SELECT pipeline_run_id FROM sync_pipeline_locks
       WHERE lock_key = 'canonical_workspace_sync' AND lease_expires_at > ?
    `).bind(new Date().toISOString()).first<{ pipeline_run_id: string }>();
    if (workspaceLock || await activeManualWorkspaceRun(env)) {
      return jsonErr('Another Workspace synchronization operation is already running', 409, request);
    }
  }

  const active = await env.DB.prepare(`
    SELECT id FROM sync_job_runs
     WHERE job_key = ? AND mode = ? AND status IN ('queued', 'running')
     ORDER BY started_at DESC LIMIT 1
  `).bind(jobKey, mode).first<{ id: string }>();
  if (active) return jsonErr('This sync job is already running', 409, request);

  await recordPrivilegedAction(env, principal, {
    action: 'sync_job.retry', targetType: 'sync_job', targetId: `${pipeline}:${jobKey}`, outcome: 'accepted',
  });

  const pipelineRunId = crypto.randomUUID();
  const runId = await startSyncJob(env.DB, {
    jobKey, trigger: 'manual', mode, status: 'queued', pipelineRunId,
  });
  const auditActor = actorFor(principal);
  if (jobKey === 'hubspot_contacts') {
    ctx.waitUntil(
      initializeHubSpotSyncRun(env, { jobRunId: runId, auditActor })
        .catch(error => failHubSpotSyncDispatch(env, { jobRunId: runId, auditActor }, error)),
    );
  } else if (jobKey === 'orphan_cleanup') {
    const params = { jobRunId: runId, pipelineRunId, auditActor };
    ctx.waitUntil(
      initializeOrphanCleanupRun(env, params)
        .catch(error => failOrphanCleanupDispatch(env, params, error)),
    );
  } else if (MANUAL_JOB_KEYS.has(jobKey as ManualSyncJobKey)) {
    const params = {
      jobRunId: runId,
      pipelineRunId,
      jobKey: jobKey as ManualSyncJobKey,
      auditActor,
    };
    ctx.waitUntil(
      initializeManualSyncJob(env, params)
        .catch(error => failManualSyncJobDispatch(env, params, error)),
    );
  } else {
    await finishSyncJob(env.DB, runId, 'failed', {
      errorCode: 'unsupported_manual_job', error: 'No manual executor is registered for this job.',
    });
    return jsonErr('No manual executor is registered for this job', 409, request);
  }

  return secHeaders(Response.json({
    ok: true,
    accepted: true,
    job_key: jobKey,
    pipeline,
    retried_run_id: retriedRunId,
    retry_run_id: runId,
    execution_scope: 'individual_job',
  }, { status: 202 }), request);
}
