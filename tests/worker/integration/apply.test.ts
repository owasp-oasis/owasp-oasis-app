import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';

import { applySchema, cleanDB, makeCsrf } from './helpers.js';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';

describe('POST /api/apply', () => {
  beforeAll(async () => {
    await applySchema(env);
  });

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/ada')
      .respondWith(new Response(
        JSON.stringify({ login: 'ada', type: 'User' }),
        { headers: { 'Content-Type': 'application/json' } },
      ));
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  async function apply(body: Record<string, unknown>) {
    const csrf = makeCsrf();
    return SELF.fetch(new Request('http://localhost/api/apply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrf,
        Cookie: `__csrf=${csrf}`,
      },
      body: JSON.stringify(body),
    }));
  }

  it('stores an application and its CRM outbox job atomically', async () => {
    const res = await apply({
      name: 'Ada Lovelace',
      email: 'ada@oasis-test.internal',
      github: '@ada',
      org: 'Analytical Engines',
      why: 'Private application narrative that must stay in D1.',
      role: 'validator',
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(await env.DB.prepare('SELECT why FROM applications WHERE email = ?')
      .bind('ada@oasis-test.internal').first<{ why: string }>()).toEqual({
      why: 'Private application narrative that must stay in D1.',
    });

    const queued = await env.DB.prepare(
      'SELECT source_type, source_key, payload_json, status FROM hubspot_sync_queue WHERE source_key = ?',
    ).bind('ada@oasis-test.internal:validator').first<{
      source_type: string;
      source_key: string;
      payload_json: string;
      status: string;
    }>();
    expect(queued).toMatchObject({
      source_type: 'application',
      source_key: 'ada@oasis-test.internal:validator',
      status: 'pending',
    });
    const payload = JSON.parse(queued?.payload_json ?? '{}') as Record<string, unknown>;
    expect(payload).toMatchObject({
      source: 'application',
      email: 'ada@oasis-test.internal',
      name: 'Ada Lovelace',
      github: 'ada',
      role: 'validator',
      organization: 'Analytical Engines',
    });
    expect(payload).not.toHaveProperty('why');
  });

  it('requires a role', async () => {
    const res = await apply({
      name: 'Ada Lovelace',
      email: 'ada@oasis-test.internal',
      github: 'ada',
      org: '',
      why: '',
      role: '',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'Please select a role to apply for' });
  });

  it('rejects an application when the GitHub account does not exist', async () => {
    fetchMock.deactivate();
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/not-a-real-oasis-user')
      .respondWith(new Response('Not Found', { status: 404 }));

    const res = await apply({
      name: 'Ada Lovelace',
      email: 'missing-github@oasis-test.internal',
      github: 'not-a-real-oasis-user',
      org: '',
      why: '',
      role: 'validator',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: 'GitHub account not found' });
    const application = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM applications WHERE email = ?',
    ).bind('missing-github@oasis-test.internal').first<{ count: number }>();
    expect(application?.count).toBe(0);
  });

  it('responds idempotently and refreshes an unsynced duplicate job', async () => {
    const body = {
      name: 'Ada Lovelace',
      email: 'ada@oasis-test.internal',
      github: 'ada',
      org: 'Analytical Engines',
      why: 'First message',
      role: 'validator',
    };
    expect((await apply(body)).status).toBe(200);
    const duplicate = await apply({ ...body, org: 'Updated Organisation', why: 'Second message' });

    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({ ok: true });
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM applications WHERE email = ? AND role = ?')
      .bind(body.email, body.role).first<{ count: number }>();
    expect(count?.count).toBe(1);
    const queued = await env.DB.prepare('SELECT payload_json FROM hubspot_sync_queue WHERE source_key = ?')
      .bind(`${body.email}:${body.role}`).first<{ payload_json: string }>();
    expect(JSON.parse(queued?.payload_json ?? '{}')).toMatchObject({ organization: 'Updated Organisation' });
  });
});
