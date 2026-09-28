import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  countHubSpotQueueRemaining,
  enqueueHubSpotSync,
  processHubSpotQueue,
  snapshotHubSpotQueue,
} from '../../../worker/hubspot.js';
import {
  HUBSPOT_SYNC_CHUNK_SIZE,
  startHubSpotSync,
} from '../../../worker/hubSpotSyncWorkflow.js';
import type { Env, HubSpotSyncParams } from '../../../worker/types.js';
import { applySchema, cleanDB } from './helpers.js';
import { fetchMock } from './fetchMock.js';

describe('bounded HubSpot synchronization', () => {
  beforeAll(async () => applySchema(env));

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  it('creates one tracked Workflow for the fixed queue snapshot', async () => {
    const created: Array<{ id?: string; params: HubSpotSyncParams }> = [];
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      HUBSPOT_SYNC_WORKFLOW: {
        async create(options: { id?: string; params: HubSpotSyncParams }) {
          created.push(options);
          return { id: options.id ?? 'generated-workflow-id' };
        },
      },
    } as Env;

    const dispatch = await startHubSpotSync(productionEnv, 'scheduled');

    expect(dispatch).toEqual(expect.objectContaining({
      started: true,
      jobRunId: expect.any(String),
      workflowInstanceId: expect.stringContaining('hubspot-sync-'),
      expectedItems: 0,
    }));
    expect(created).toHaveLength(1);
    expect(created[0].params).toEqual(expect.objectContaining({
      jobRunId: dispatch.jobRunId,
      chunk: 0,
      maxQueueId: 0,
      eligibleAt: expect.any(String),
    }));

    const run = await env.DB.prepare(`
      SELECT status, trigger_type, mode, expected_items, workflow_instance_id
        FROM sync_job_runs WHERE id = ?
    `).bind(dispatch.jobRunId).first();
    expect(run).toEqual(expect.objectContaining({
      status: 'queued', trigger_type: 'scheduled', mode: 'live', expected_items: 0,
      workflow_instance_id: dispatch.workflowInstanceId,
    }));
  });

  it('processes a fixed queue snapshot in slices below the external-request ceiling', async () => {
    for (let index = 1; index <= 31; index += 1) {
      await enqueueHubSpotSync(env.DB, {
        source: 'registration',
        email: `person-${index}@oasis-test.internal`,
        name: `Person ${index}`,
        github: `person-${index}`,
        role: 'validator',
        organization: 'OASIS Test',
        submitted_at: '2026-09-03T12:00:00.000Z',
      });
    }

    fetchMock.when(request => request.method === 'GET' && request.url.startsWith(
      'https://api.hubapi.com/crm/v3/objects/contacts/',
    )).respondWith(new Response(null, { status: 404 }));
    fetchMock.when(request => request.method === 'POST' && request.url === (
      'https://api.hubapi.com/crm/v3/objects/contacts'
    )).respondWith(new Response(null, { status: 409 }));
    fetchMock.when(request => request.method === 'PATCH' && request.url.startsWith(
      'https://api.hubapi.com/crm/v3/objects/contacts/',
    )).respondWith(new Response(null, { status: 204 }));

    const snapshot = await snapshotHubSpotQueue(env.DB);
    expect(snapshot.count).toBe(31);
    let externalRequests = 0;
    const countedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      externalRequests += 1;
      return fetch(input, init);
    };
    const processChunk = () => processHubSpotQueue({
      DB: env.DB,
      HUBSPOT_TOKEN: 'test-token',
      HUBSPOT_PROPERTY_MAP: JSON.stringify({ source: 'oasis_source' }),
    }, {
      limit: HUBSPOT_SYNC_CHUNK_SIZE,
      maxQueueId: snapshot.maxQueueId,
      eligibleAt: snapshot.eligibleAt,
      fetcher: countedFetch,
    });

    expect(HUBSPOT_SYNC_CHUNK_SIZE).toBe(15);
    await expect(processChunk()).resolves.toEqual({
      processed: 15, succeeded: 15, failed: 0, skipped: false,
    });
    expect(externalRequests).toBe(45);
    expect(await countHubSpotQueueRemaining(env.DB, snapshot)).toBe(16);

    externalRequests = 0;
    await expect(processChunk()).resolves.toEqual({
      processed: 15, succeeded: 15, failed: 0, skipped: false,
    });
    expect(externalRequests).toBe(45);
    expect(await countHubSpotQueueRemaining(env.DB, snapshot)).toBe(1);

    externalRequests = 0;
    await expect(processChunk()).resolves.toEqual({
      processed: 1, succeeded: 1, failed: 0, skipped: false,
    });
    expect(externalRequests).toBe(3);
    expect(await countHubSpotQueueRemaining(env.DB, snapshot)).toBe(0);
  });
});
