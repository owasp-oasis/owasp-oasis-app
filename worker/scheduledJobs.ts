import type { Env } from './types.js';
import { startHubSpotSync, type HubSpotDispatchResult } from './hubSpotSyncWorkflow.js';

export async function runTrackedHubSpot(
  env: Env,
  trigger: 'scheduled' | 'manual',
): Promise<HubSpotDispatchResult> {
  return startHubSpotSync(env, trigger);
}
