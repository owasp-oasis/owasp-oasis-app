import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applySchema, cleanDB } from './helpers.js';
import { deliverWelcomeEmail, shouldSendWelcomeEmail } from '../../../worker/welcomeEmail.js';
import { enqueueHubSpotSync, processHubSpotQueue, type HubSpotSubmission } from '../../../worker/hubspot.js';
import type { Env } from '../../../worker/types.js';

const signup: HubSpotSubmission = {
  source: 'registration', email: 'new@oasis-test.internal', name: 'Test User', github: '',
  role: 'validator', organization: '', submitted_at: '2026-10-01T12:00:00Z',
  welcome_environment: 'production',
};
const now = new Date('2026-10-02T02:30:00Z');
const json = (body: unknown, status = 200) => Response.json(body, { status });
function harness(options: { sendError?: unknown; trackingStatus?: number; priorDate?: string } = {}) {
  const messages: unknown[] = [];
  const requests: Array<{ method: string; body?: string }> = [];
  const bindings = {
    ...env, ENVIRONMENT: 'production', HUBSPOT_TOKEN: 'test-only',
    WELCOME_EMAIL_MODE: 'live', WELCOME_EMAIL_FROM: 'OASIS <welcome@mail.owasp-oasis.org>',
    WELCOME_EMAIL: { async send(message: unknown) {
      messages.push(message);
      if (options.sendError) throw options.sendError;
      return { messageId: 'test-message-id' };
    } },
  } as Env;
  const fetcher = async (_input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (init?.method === 'PATCH') return json({}, options.trackingStatus ?? 200);
    return json({ id: 'test-contact', properties: { welcome_email_sent_date: options.priorDate ?? '' } });
  };
  return { bindings, fetcher, messages, requests, options };
}
async function receipt() {
  return env.DB.prepare('SELECT status, sent_at FROM welcome_email_deliveries').first();
}

describe('durable signup welcome delivery', () => {
  beforeAll(() => applySchema(env));
  beforeEach(async () => {
    await cleanDB(env);
    await env.DB.prepare('DELETE FROM welcome_email_deliveries').run();
  });

  it('welcomes an existing CRM contact and checkpoints acceptance before tracking', async () => {
    const h = harness();
    await enqueueHubSpotSync(env.DB, signup, now);
    expect(await processHubSpotQueue(h.bindings, { fetcher: h.fetcher, now })).toMatchObject({ succeeded: 1 });
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]).toMatchObject({ to: signup.email, subject: 'Welcome to the OASIS community' });
    expect(await receipt()).toMatchObject({ status: 'tracked', sent_at: now.toISOString() });
    const patch = h.requests.find(r => r.method === 'PATCH');
    expect(JSON.parse(patch!.body!)).toEqual({ properties: { welcome_email_sent_date: '2026-10-01' } });
    await deliverWelcomeEmail(signup, h.bindings, h.fetcher, now);
    expect(h.messages).toHaveLength(1);
  });

  it('retries explicit rejection through the queue after contact creation or lookup', async () => {
    const h = harness({ sendError: Object.assign(new Error('safe test'), { code: 'E_RATE_LIMIT_EXCEEDED' }) });
    await enqueueHubSpotSync(env.DB, signup, now);
    expect(await processHubSpotQueue(h.bindings, { fetcher: h.fetcher, now })).toMatchObject({ failed: 1 });
    expect(await receipt()).toMatchObject({ status: 'pending', sent_at: null });
    h.options.sendError = undefined;
    expect(await processHubSpotQueue(h.bindings, { fetcher: h.fetcher, now: new Date(now.getTime() + 120_000) }))
      .toMatchObject({ succeeded: 1 });
    expect(h.messages).toHaveLength(2);
    expect(await receipt()).toMatchObject({ status: 'tracked' });
  });

  it('retries a tracking failure without resending', async () => {
    const h = harness({ trackingStatus: 500 });
    await enqueueHubSpotSync(env.DB, signup, now);
    expect(await processHubSpotQueue(h.bindings, { fetcher: h.fetcher, now })).toMatchObject({ failed: 1 });
    expect(await receipt()).toMatchObject({ status: 'sent' });
    h.options.trackingStatus = 200;
    expect(await processHubSpotQueue(h.bindings, { fetcher: h.fetcher, now: new Date(now.getTime() + 120_000) }))
      .toMatchObject({ succeeded: 1 });
    expect(h.messages).toHaveLength(1);
    expect(await receipt()).toMatchObject({ status: 'tracked' });
  });

  it('holds ambiguous provider outcomes for reconciliation instead of resending', async () => {
    const h = harness({ sendError: new Error('transport failure with sensitive content') });
    await expect(deliverWelcomeEmail(signup, h.bindings, h.fetcher, now)).rejects.toThrow('welcome_send_unknown');
    h.options.sendError = undefined;
    await expect(deliverWelcomeEmail(signup, h.bindings, h.fetcher, now))
      .rejects.toThrow('welcome_delivery_needs_reconciliation');
    expect(h.messages).toHaveLength(1);
    expect(await receipt()).toMatchObject({ status: 'uncertain' });
  });

  it('allows only one sender when deliveries overlap', async () => {
    const h = harness();
    await Promise.allSettled([
      deliverWelcomeEmail(signup, h.bindings, h.fetcher, now),
      deliverWelcomeEmail(signup, h.bindings, h.fetcher, now),
    ]);
    expect(h.messages).toHaveLength(1);
  });

  it('honors a previously recorded HubSpot welcome date', async () => {
    const h = harness({ priorDate: '2026-09-03' });
    await deliverWelcomeEmail(signup, h.bindings, h.fetcher, now);
    expect(h.messages).toHaveLength(0);
    expect(await receipt()).toMatchObject({ status: 'tracked' });
  });

  it('restricts staging to one configured recipient and keeps staging receipts separate', async () => {
    const h = harness({ priorDate: '2026-09-03' });
    h.bindings.ENVIRONMENT = 'email-staging';
    h.bindings.WELCOME_EMAIL_MODE = 'test';
    h.bindings.WELCOME_EMAIL_TEST_RECIPIENT = signup.email;
    const staged = { ...signup, welcome_environment: 'email-staging' };
    await deliverWelcomeEmail({ ...staged, email: 'other@oasis-test.internal' }, h.bindings, h.fetcher, now);
    expect(h.messages).toHaveLength(0);
    await deliverWelcomeEmail(staged, h.bindings, h.fetcher, now);
    await deliverWelcomeEmail(staged, h.bindings, h.fetcher, now);
    expect(h.messages).toHaveLength(1);
    expect(shouldSendWelcomeEmail(signup, h.bindings)).toBe(false);
    h.bindings.WELCOME_EMAIL_MODE = 'live';
    expect(shouldSendWelcomeEmail(staged, h.bindings)).toBe(false);
  });

  it('does not backfill historical submissions, applications, or disabled environments', async () => {
    const h = harness();
    await deliverWelcomeEmail({ ...signup, welcome_environment: undefined }, h.bindings, h.fetcher, now);
    await deliverWelcomeEmail({ ...signup, source: 'application' }, h.bindings, h.fetcher, now);
    h.bindings.WELCOME_EMAIL_MODE = 'off';
    await deliverWelcomeEmail(signup, h.bindings, h.fetcher, now);
    expect(h.messages).toHaveLength(0);
    expect(h.requests).toHaveLength(0);
  });

  it('retains welcome eligibility when duplicate form submissions update a pending job', async () => {
    await enqueueHubSpotSync(env.DB, signup, now);
    await enqueueHubSpotSync(env.DB, { ...signup, welcome_environment: undefined }, now);
    const row = await env.DB.prepare('SELECT payload_json FROM hubspot_sync_queue').first<{ payload_json: string }>();
    expect(JSON.parse(row!.payload_json).welcome_environment).toBe('production');
  });

  it('leaves a missing email binding retryable rather than declaring the signup fully synced', async () => {
    const h = harness();
    h.bindings.WELCOME_EMAIL = undefined;
    await enqueueHubSpotSync(env.DB, signup, now);
    expect(await processHubSpotQueue(h.bindings, { fetcher: h.fetcher, now })).toMatchObject({ failed: 1 });
    const row = await env.DB.prepare('SELECT status, last_error FROM hubspot_sync_queue').first();
    expect(row).toMatchObject({ status: 'pending', last_error: 'welcome_configuration_missing' });
  });
});
