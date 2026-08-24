import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HubSpotSyncError,
  buildMappedProperties,
  parsePropertyMap,
  processHubSpotQueue,
  retryAt,
  splitName,
  submissionKey,
  syncHubSpotContact,
} from '../hubspot.js';

const submission = {
  source: 'application',
  email: 'person@example.org',
  name: 'Ada Lovelace',
  github: 'ada',
  role: 'validator',
  organization: 'Analytical Engines',
  submitted_at: '2026-08-21T12:00:00.000Z',
};

function response(status) {
  return new Response(null, { status });
}

function fakeQueueDb(row) {
  const updates = [];
  return {
    updates,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() {
              return { results: [row] };
            },
            async run() {
              updates.push({ sql, args });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test('builds stable source keys without including contact data in logs or identifiers beyond email', () => {
  assert.equal(submissionKey({ ...submission, source: 'registration' }), 'person@example.org');
  assert.equal(submissionKey(submission), 'person@example.org:validator');
});

test('accepts only safe custom-property mappings and converts datetime values', () => {
  const rawMap = JSON.stringify({
    github: 'oasis_github',
    role: 'firstname',
    source: 'oasis_source',
    organization: 'Invalid-Property',
    submitted_at: 'oasis_submitted_at',
  });

  assert.deepEqual(parsePropertyMap(rawMap), {
    github: 'oasis_github',
    source: 'oasis_source',
    submitted_at: 'oasis_submitted_at',
  });
  assert.deepEqual(buildMappedProperties(submission, rawMap), {
    oasis_github: 'ada',
    oasis_source: 'application',
    oasis_submitted_at: String(Date.parse(submission.submitted_at)),
  });
});

test('creates missing contacts and does not send an empty lastname for single-word names', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return response(requests.length === 1 ? 404 : 201);
  };

  const result = await syncHubSpotContact(
    { ...submission, name: 'Prince' },
    'test-token',
    JSON.stringify({ source: 'oasis_source', role: 'oasis_role' }),
    fetcher,
  );

  assert.deepEqual(result, { created: true });
  assert.equal(requests[0].options.method, 'GET');
  assert.equal(requests[1].options.method, 'POST');
  const body = JSON.parse(requests[1].options.body);
  assert.deepEqual(body.properties, {
    email: 'person@example.org',
    oasis_role: 'validator',
    oasis_source: 'application',
    firstname: 'Prince',
  });
});

test('updates only configured OASIS properties on an existing contact', async () => {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return response(200);
  };

  const result = await syncHubSpotContact(
    submission,
    'test-token',
    JSON.stringify({ github: 'oasis_github', organization: 'oasis_organization' }),
    fetcher,
  );

  assert.deepEqual(result, { created: false });
  assert.equal(requests.length, 2);
  assert.equal(requests[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    properties: {
      oasis_github: 'ada',
      oasis_organization: 'Analytical Engines',
    },
  });
});

test('surfaces retryable HTTP failures without reading or logging response bodies', async () => {
  await assert.rejects(
    syncHubSpotContact(submission, 'test-token', '', async () => response(429)),
    error => error instanceof HubSpotSyncError && error.code === 'http_429' && error.status === 429,
  );
});

test('uses capped exponential retry delays', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');
  assert.equal(retryAt(1, now), '2026-08-21T12:01:00.000Z');
  assert.equal(retryAt(2, now), '2026-08-21T12:02:00.000Z');
  assert.equal(retryAt(100, now), '2026-08-22T12:00:00.000Z');
});

test('marks successful outbox jobs as synced', async () => {
  const db = fakeQueueDb({ id: 7, payload_json: JSON.stringify(submission), attempts: 0 });
  const result = await processHubSpotQueue(
    { DB: db, HUBSPOT_TOKEN: 'test-token', HUBSPOT_PROPERTY_MAP: '' },
    {
      now: new Date('2026-08-21T12:00:00.000Z'),
      fetcher: async () => response(200),
    },
  );

  assert.deepEqual(result, { processed: 1, succeeded: 1, failed: 0, skipped: false });
  const completion = db.updates.find(update => update.sql.includes("status = 'synced'"));
  assert.ok(completion);
  assert.deepEqual(completion.args, [
    '2026-08-21T12:00:00.000Z',
    '2026-08-21T12:00:00.000Z',
    7,
  ]);
});

test('returns failed outbox jobs to pending with a safe error and retry time', async () => {
  const db = fakeQueueDb({ id: 8, payload_json: JSON.stringify(submission), attempts: 0 });
  const result = await processHubSpotQueue(
    { DB: db, HUBSPOT_TOKEN: 'test-token', HUBSPOT_PROPERTY_MAP: '' },
    {
      now: new Date('2026-08-21T12:00:00.000Z'),
      fetcher: async () => response(429),
    },
  );

  assert.deepEqual(result, { processed: 1, succeeded: 0, failed: 1, skipped: false });
  const failure = db.updates.find(update => update.sql.includes("SET status = 'pending'"));
  assert.ok(failure);
  assert.deepEqual(failure.args, [
    1,
    '2026-08-21T12:01:00.000Z',
    'http_429',
    '2026-08-21T12:00:00.000Z',
    8,
  ]);
});

test('splits multi-part names without manufacturing a lastname', () => {
  assert.deepEqual(splitName('Mary Jane Watson'), { firstname: 'Mary', lastname: 'Jane Watson' });
  assert.deepEqual(splitName('Prince'), { firstname: 'Prince', lastname: '' });
});
