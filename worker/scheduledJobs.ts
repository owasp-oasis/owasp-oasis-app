import type { Env } from './types.js';
import { reconcileRemovedRepositories, runCleanup } from './cleanup.js';
import { processHubSpotQueue } from './hubspot.js';
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

  const cleanupRunId = await startSyncJob(env.DB, {
    jobKey: 'orphan_cleanup',
    pipelineRunId,
    trigger: 'scheduled',
    mode: 'legacy',
  });
  try {
    const cleanup = await runCleanup(env);
    cleanupErrors = cleanup.errors;
    await finishSyncJob(env.DB, cleanupRunId, cleanup.errors > 0 ? 'failed' : 'succeeded', {
      metrics: {
        checked: cleanup.checked,
        flagged: cleanup.flagged,
        errors: cleanup.errors,
      },
      completedItems: cleanup.checked,
      failedItems: cleanup.errors,
      errorCode: cleanup.errors > 0 ? 'orphan_checks_failed' : null,
      error: cleanup.errors > 0 ? `${cleanup.errors} orphan check(s) failed.` : undefined,
    });
    console.log(JSON.stringify({
      event: 'legacy_orphan_cleanup_complete',
      pipeline_run_id: pipelineRunId,
      result: cleanup,
    }));
  } catch (error) {
    cleanupErrors = 1;
    await finishSyncJob(env.DB, cleanupRunId, 'failed', { errorCode: 'orphan_cleanup_exception', error });
    console.error(JSON.stringify({ event: 'legacy_orphan_cleanup_failed', pipeline_run_id: pipelineRunId }));
  }

  const ok = repositoryErrors === 0 && syncErrors === 0 && cleanupErrors === 0;
  await finishSyncJob(env.DB, parentRunId, ok ? 'succeeded' : 'failed', {
    metrics: {
      ...syncMetrics,
      repository_errors: repositoryErrors,
      sync_errors: syncErrors,
      cleanup_errors: cleanupErrors,
    },
    errorCode: ok ? null : 'legacy_pipeline_incomplete',
    error: ok ? undefined : 'At least one canonical synchronization stage did not complete successfully.',
  });

  await recordDailyBudget(env.DB, {
    key: 'workflow_steps',
    label: 'OASIS Workflow steps',
    unit: 'steps',
    limit: 2_000,
  });
  await pruneSyncJobHistory(env.DB);
  return { pipelineRunId, ok, repositoryErrors, syncErrors, cleanupErrors };
}
