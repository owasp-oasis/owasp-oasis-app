import type { Env } from './types.js';
import { processHubSpotQueue } from './hubspot.js';
import {
  finishSyncJob,
  startSyncJob,
} from './syncJobs.js';

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
