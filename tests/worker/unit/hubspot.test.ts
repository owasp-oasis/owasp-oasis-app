import { describe, expect, it } from 'vitest';

import {
  HubSpotSyncError,
  buildMappedProperties,
  parsePropertyMap,
  processHubSpotQueue,
  retryAt,
  splitName,
  submissionKey,
  syncHubSpotContact,
  type HubSpotSubmission,
} from '../../../worker/hubspot.js';

const token = ['unit', 'credential'].join('-');
const submission: HubSpotSubmission = {
  source: 'application',
  email: 'person@oasis-test.internal',
  name: 'Ada Lovelace',
  github: 'ada',
  role: 'validator',
  organization: 'Analytical Engines',
  submitted_at: '2026-08-21T12:00:00.000Z',
};

function response(status: number): Response {
  return new Response(null, { status });
}

function fakeQueueDb(row: { id: number; payload_json: string; attempts: number }) {
  const updates: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async all() {
              return { results: [row], success: true, meta: {} };
            },
            async run() {
              updates.push({ sql, args });
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return { db: db as unknown as D1Database, updates };
}

describe('HubSpot contact mapping', () => {
  it('builds stable source keys for idempotent submissions', () => {
    expect(submissionKey({ ...submission, source: 'registration' })).toBe('person@oasis-test.internal');
    expect(submissionKey(submission)).toBe('person@oasis-test.internal:validator');
  });

  it('accepts only safe custom-property mappings and converts datetimes', () => {
    const rawMap = JSON.stringify({
      github: 'oasis_github',
      role: 'firstname',
      source: 'oasis_source',
      organization: 'Invalid-Property',
      submitted_at: 'oasis_submitted_at',
    });

    expect(parsePropertyMap(rawMap)).toEqual({
      github: 'oasis_github',
      source: 'oasis_source',
      submitted_at: 'oasis_submitted_at',
    });
    expect(buildMappedProperties(submission, rawMap)).toEqual({
      oasis_github: 'ada',
      oasis_source: 'application',
      oasis_submitted_at: String(Date.parse(submission.submitted_at)),
    });
  });

  it('creates missing contacts without an empty lastname', async () => {
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ url: String(input), options });
      return response(requests.length === 1 ? 404 : 201);
    };

    await expect(syncHubSpotContact(
      { ...submission, name: 'Prince' },
      token,
      JSON.stringify({ source: 'oasis_source', role: 'oasis_role' }),
      fetcher,
    )).resolves.toEqual({ created: true });

    expect(requests[0].options?.method).toBe('GET');
    expect(requests[1].options?.method).toBe('POST');
    expect(JSON.parse(String(requests[1].options?.body))).toEqual({
      properties: {
        email: 'person@oasis-test.internal',
        oasis_role: 'validator',
        oasis_source: 'application',
        firstname: 'Prince',
      },
    });
  });

  it('updates only configured OASIS properties on an existing contact', async () => {
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    const fetcher = async (input: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ url: String(input), options });
      return response(200);
    };

    await expect(syncHubSpotContact(
      submission,
      token,
      JSON.stringify({ github: 'oasis_github', organization: 'oasis_organization' }),
      fetcher,
    )).resolves.toEqual({ created: false });

    expect(requests).toHaveLength(2);
    expect(requests[1].options?.method).toBe('PATCH');
    expect(JSON.parse(String(requests[1].options?.body))).toEqual({
      properties: {
        oasis_github: 'ada',
        oasis_organization: 'Analytical Engines',
      },
    });
  });

  it('surfaces retryable HTTP failures without reading response bodies', async () => {
    await expect(syncHubSpotContact(submission, token, '', async () => response(429)))
      .rejects.toMatchObject<Partial<HubSpotSyncError>>({ code: 'http_429', status: 429 });
  });

  it('splits multi-part names without manufacturing a lastname', () => {
    expect(splitName('Mary Jane Watson')).toEqual({ firstname: 'Mary', lastname: 'Jane Watson' });
    expect(splitName('Prince')).toEqual({ firstname: 'Prince', lastname: '' });
  });
});

describe('HubSpot durable queue', () => {
  it('uses capped exponential retry delays', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');
    expect(retryAt(1, now)).toBe('2026-08-21T12:01:00.000Z');
    expect(retryAt(2, now)).toBe('2026-08-21T12:02:00.000Z');
    expect(retryAt(100, now)).toBe('2026-08-22T12:00:00.000Z');
  });

  it('marks successful jobs as synced', async () => {
    const { db, updates } = fakeQueueDb({ id: 7, payload_json: JSON.stringify(submission), attempts: 0 });
    await expect(processHubSpotQueue(
      { DB: db, HUBSPOT_TOKEN: token, HUBSPOT_PROPERTY_MAP: '' },
      { now: new Date('2026-08-21T12:00:00.000Z'), fetcher: async () => response(200) },
    )).resolves.toEqual({ processed: 1, succeeded: 1, failed: 0, skipped: false });

    const completion = updates.find(update => update.sql.includes("status = 'synced'"));
    expect(completion?.args).toEqual(['2026-08-21T12:00:00.000Z', '2026-08-21T12:00:00.000Z', 7]);
  });

  it('returns failed jobs to pending with a safe error and retry time', async () => {
    const { db, updates } = fakeQueueDb({ id: 8, payload_json: JSON.stringify(submission), attempts: 0 });
    await expect(processHubSpotQueue(
      { DB: db, HUBSPOT_TOKEN: token, HUBSPOT_PROPERTY_MAP: '' },
      { now: new Date('2026-08-21T12:00:00.000Z'), fetcher: async () => response(429) },
    )).resolves.toEqual({ processed: 1, succeeded: 0, failed: 1, skipped: false });

    const failure = updates.find(update => update.sql.includes("SET status = 'pending'"));
    expect(failure?.args).toEqual([
      1,
      '2026-08-21T12:01:00.000Z',
      'http_429',
      '2026-08-21T12:00:00.000Z',
      8,
    ]);
  });
});
