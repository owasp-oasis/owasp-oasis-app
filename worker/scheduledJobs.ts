import type { Env } from './types.js';
import { reconcileRemovedRepositories } from './cleanup.js';
import { processHubSpotQueue } from './hubspot.js';
import { failOrphanCleanupDispatch, initializeOrphanCleanupRun } from './orphanCleanupWorkflow.js';
import { runSync } from './sync.js';
import {
  finishSyncJob,
  interruptExpiredSyncJobs,
  pruneSyncJobHistory,
  recordDailyBudget,
  startSyncJob,
} from './syncJobs.js';

export interface LegacySyncExecution {
  pipelineRunId: string;
  ok: boolean;
  repositoryErrors: number;
  syncErrors: number;
  cleanupErrors: number;
}

export async function runTrackedHubSpot(env: Env, trigger: 'scheduled' | 'manual'): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  skipped: boolean;
}> {
  const jobRunId = await startSyncJob(env.DB, {
    jobKey: 'hubspot_contacts',
    trigger,
    mode: 'live',
  });
  try {
    const result = await processHubSpotQueue(env, { limit: 25 });
    const status = result.skipped ? 'skipped' : result.failed > 0 ? 'failed' : 'succeeded';
    await finishSyncJob(env.DB, jobRunId, status, {
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
    return result;
  } catch (error) {
    await finishSyncJob(env.DB, jobRunId, 'failed', {
      errorCode: 'processor_error',
      error,
    });
    throw error;
  }
}

export async function runTrackedLegacySync(env: Env): Promise<LegacySyncExecution> {
  await interruptExpiredSyncJobs(env.DB);
  const pipelineRunId = crypto.randomUUID();
  const parentRunId = await startSyncJob(env.DB, {
    jobKey: 'legacy_workspace_sync',
    pipelineRunId,
    trigger: 'scheduled',
    mode: 'legacy',
  });

  let repositoryErrors = 0;
  let syncErrors = 0;
  let cleanupErrors = 0;
  let syncMetrics: Record<string, number> = {};

  const inventoryRunId = await startSyncJob(env.DB, {
    jobKey: 'repository_inventory',
    pipelineRunId,
    trigger: 'scheduled',
    mode: 'legacy',
  });
  try {
    const repositoryCleanup = await reconcileRemovedRepositories(env);
    repositoryErrors = repositoryCleanup.errors;
    await finishSyncJob(env.DB, inventoryRunId, repositoryCleanup.errors > 0 ? 'failed' : 'succeeded', {
      metrics: {
        checked: repositoryCleanup.checked,
        removed: repositoryCleanup.removed,
        flagged: repositoryCleanup.flagged,
        errors: repositoryCleanup.errors,
      },
      completedItems: repositoryCleanup.checked,
      failedItems: repositoryCleanup.errors,
      errorCode: repositoryCleanup.errors > 0 ? 'repository_reconciliation_failed' : null,
      error: repositoryCleanup.errors > 0 ? `${repositoryCleanup.errors} repository reconciliation operation(s) failed.` : undefined,
    });
    console.log(JSON.stringify({
      event: 'legacy_repository_inventory_complete',
      pipeline_run_id: pipelineRunId,
      result: repositoryCleanup,
    }));
  } catch (error) {
    repositoryErrors = 1;
    await finishSyncJob(env.DB, inventoryRunId, 'failed', { errorCode: 'repository_inventory_exception', error });
    console.error(JSON.stringify({ event: 'legacy_repository_inventory_failed', pipeline_run_id: pipelineRunId }));
  }

  if (env.DB) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO sync_state (key, value) VALUES ('sync_running', '1')",
    ).run();
  }
  const syncResult = await runSync(env);
  if (!syncResult.ok) syncErrors = 1;
  syncMetrics = {
    repositories: syncResult.stats.repos,
    pull_requests: syncResult.stats.prs,
    comments: syncResult.stats.comments,
  };
  console.log(JSON.stringify({
    event: 'legacy_workspace_sync_complete',
    pipeline_run_id: pipelineRunId,
    ok: syncResult.ok,
    stats: syncResult.stats,
  }));

  const parentMetrics = {
    ...syncMetrics,
    repository_errors: repositoryErrors,
    sync_errors: syncErrors,
    cleanup_pending: true,
  };
  await env.DB.prepare(
    'UPDATE sync_job_runs SET metrics_json = ? WHERE id = ?',
  ).bind(JSON.stringify(parentMetrics), parentRunId).run();

  let cleanupRunId: string | null = null;
  try {
    cleanupRunId = await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup',
      pipelineRunId,
      trigger: 'scheduled',
      mode: 'legacy',
      status: 'queued',
    });
    const workflowInstanceId = await initializeOrphanCleanupRun(env, {
      jobRunId: cleanupRunId,
      pipelineRunId,
      legacyParentRunId: parentRunId,
    });
    console.log(JSON.stringify({
      event: 'legacy_orphan_cleanup_dispatched',
      pipeline_run_id: pipelineRunId,
      job_run_id: cleanupRunId,
      workflow_instance_id: workflowInstanceId,
    }));
  } catch (error) {
    cleanupErrors = 1;
    if (cleanupRunId) {
      await failOrphanCleanupDispatch(env, {
        jobRunId: cleanupRunId,
        pipelineRunId,
        legacyParentRunId: parentRunId,
      }, error);
    } else {
      await finishSyncJob(env.DB, parentRunId, 'failed', {
        metrics: { ...parentMetrics, cleanup_pending: false, cleanup_errors: 1 },
        errorCode: 'orphan_cleanup_dispatch_failed',
        error,
      });
    }
  }

  const ok = repositoryErrors === 0 && syncErrors === 0 && cleanupErrors === 0;

  await recordDailyBudget(env.DB, {
    key: 'workflow_steps',
    label: 'OASIS Workflow steps',
    unit: 'steps',
    limit: 2_000,
  });
  await pruneSyncJobHistory(env.DB);
  return { pipelineRunId, ok, repositoryErrors, syncErrors, cleanupErrors };
}
