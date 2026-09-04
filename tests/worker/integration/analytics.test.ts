import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runAnalyticsCollector } from '../../../worker/analytics.js';
import { handleAdminAnalyticsCollect } from '../../../worker/handlers/analytics.js';
import type { Env } from '../../../worker/types.js';
import { fetchMock } from './fetchMock.js';
import {
  applySchema,
  buildCookieHeader,
  cleanDB,
  createTestSession,
  insertTestPR,
  insertTestRepo,
  makeCsrf,
} from './helpers.js';
import { SELF } from './testWorker.js';

function telemetryRequest(path: string, body: Record<string, unknown>, csrf: string, cookies = ''): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrf,
      Cookie: buildCookieHeader(`__csrf=${csrf}`, cookies),
    },
    body: JSON.stringify(body),
  });
}

describe('privacy-safe administrative analytics', () => {
  beforeAll(async () => applySchema(env));

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  it('normalizes and idempotently aggregates page views without request identifiers', async () => {
    const csrf = makeCsrf();
    const eventId = crypto.randomUUID();
    const request = () => telemetryRequest('/api/analytics/pageview', {
      event_id: eventId,
      path: '/workspace/status/runs/sensitive-run-id?token=secret',
      load_ms: 412,
      response_status: 200,
    }, csrf);

    expect((await SELF.fetch(request())).status).toBe(200);
    expect((await SELF.fetch(request())).status).toBe(200);

    const row = await env.DB.prepare(`
      SELECT route_key, page_views, navigation_count, load_ms_sum, response_2xx
        FROM analytics_daily_routes
    `).first();
    expect(row).toEqual({
      route_key: '/workspace/status/runs/:id',
      page_views: 1,
      navigation_count: 1,
      load_ms_sum: 412,
      response_2xx: 1,
    });
    const columns = await env.DB.prepare('PRAGMA table_info(analytics_daily_routes)').all<{ name: string }>();
    expect(columns.results.map(column => column.name)).not.toEqual(expect.arrayContaining([
      'github_login', 'email', 'ip', 'user_agent', 'referrer',
    ]));
  });

  it('requires authentication for review engagement and stores only project aggregates', async () => {
    const repo = await insertTestRepo(env, { id: 710, name: 'privacy-project' });
    const pr = await insertTestPR(env, { id: 711, repo_id: repo.id, repo_name: repo.name });
    const csrf = makeCsrf();
    const body = {
      event_id: crypto.randomUUID(), pr_id: pr.id, type: 'review_heartbeat', active_seconds: 30,
    };
    expect((await SELF.fetch(telemetryRequest('/api/analytics/engagement', body, csrf))).status).toBe(401);

    const member = await createTestSession(env, { github_user_id: 991, github_login: 'private-reviewer' });
    const response = await SELF.fetch(telemetryRequest(
      '/api/analytics/engagement', body, csrf,
      buildCookieHeader(member.sessionCookie, member.tokenCookie),
    ));
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(`
      SELECT repo_id, review_opens, active_seconds, votes_submitted
        FROM analytics_daily_engagement
    `).first();
    expect(row).toEqual({ repo_id: repo.id, review_opens: 0, active_seconds: 30, votes_submitted: 0 });
    const stored = JSON.stringify((await env.DB.prepare('SELECT * FROM analytics_daily_engagement').all()).results);
    expect(stored).not.toContain('private-reviewer');
  });

  it('enforces the admin role and suppresses engagement below its privacy cohort', async () => {
    const guestResponse = await SELF.fetch(new Request('http://localhost/api/admin/analytics'));
    expect(guestResponse.status).toBe(401);

    const member = await createTestSession(env, { github_user_id: 992, github_login: 'ordinary-member' });
    const memberResponse = await SELF.fetch(new Request('http://localhost/api/admin/analytics', {
      headers: { Cookie: buildCookieHeader(member.sessionCookie, member.tokenCookie) },
    }));
    expect(memberResponse.status).toBe(403);

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const adminResponse = await SELF.fetch(new Request('http://localhost/api/admin/analytics', {
      headers: { Cookie: buildCookieHeader(admin.sessionCookie, admin.tokenCookie) },
    }));
    expect(adminResponse.status).toBe(200);
    const payload = await adminResponse.json() as {
      privacy: { engagement_suppressed: boolean; individual_identifiers_returned: boolean };
      engagement: unknown;
    };
    expect(payload.privacy).toEqual(expect.objectContaining({
      engagement_suppressed: true,
      individual_identifiers_returned: false,
    }));
    expect(payload.engagement).toBeNull();
    expect(JSON.stringify(payload)).not.toContain('humor4fun');
    expect(JSON.stringify(payload)).not.toContain('ordinary-member');
  });

  it('requires an admin session and CSRF match for manual collection', async () => {
    const productionEnv = { ...env, ENVIRONMENT: 'production' } as Env;
    const member = await createTestSession(env, { github_user_id: 994, github_login: 'member-collector' });
    const memberCsrf = makeCsrf();
    const memberResponse = await handleAdminAnalyticsCollect(telemetryRequest(
      '/api/admin/analytics/collect', {}, memberCsrf,
      buildCookieHeader(member.sessionCookie, member.tokenCookie),
    ), productionEnv);
    expect(memberResponse.status).toBe(403);

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const adminCsrf = makeCsrf();
    const adminResponse = await handleAdminAnalyticsCollect(telemetryRequest(
      '/api/admin/analytics/collect', {}, adminCsrf,
      buildCookieHeader(admin.sessionCookie, admin.tokenCookie),
    ), productionEnv);
    expect(adminResponse.status).toBe(200);
    await expect(adminResponse.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
      configuration_required: true,
    }));
    const audit = await env.DB.prepare(`
      SELECT github_login, role, action, outcome FROM privileged_action_audit
    `).first();
    expect(audit).toEqual({
      github_login: 'humor4fun', role: 'admin', action: 'analytics.collect', outcome: 'accepted',
    });
  });

  it('archives five closed Cloudflare days per run and leaves the backfill checkpointed', async () => {
    fetchMock.when(request => request.url === 'https://api.cloudflare.com/client/v4/graphql')
      .respondWith(Response.json({
        data: { viewer: { zones: [{
          totals: [{ count: 100, avg: { sampleInterval: 1 }, sum: { visits: 40, edgeResponseBytes: 2048 } }],
          statuses: [
            { count: 97, dimensions: { edgeResponseStatus: 200 } },
            { count: 2, dimensions: { edgeResponseStatus: 404 } },
            { count: 1, dimensions: { edgeResponseStatus: 500 } },
          ],
          cache: [
            { count: 75, dimensions: { cacheStatus: 'hit' } },
            { count: 25, dimensions: { cacheStatus: 'miss' } },
          ],
        }] } },
      }));
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      CLOUDFLARE_ANALYTICS_TOKEN: 'test-analytics-token',
      CLOUDFLARE_ZONE_ID: 'test-zone-id',
    } as Env;

    const result = await runAnalyticsCollector(productionEnv, 'manual');
    expect(result).toEqual(expect.objectContaining({
      started: true, processed_days: 5, failed_days: 0, remaining_days: 25,
    }));
    const archive = await env.DB.prepare(`
      SELECT COUNT(*) AS days, SUM(requests_estimate) AS requests,
             SUM(response_5xx) AS errors, SUM(cache_hits_estimate) AS hits
        FROM analytics_daily_cloudflare
    `).first();
    expect(archive).toEqual({ days: 5, requests: 500, errors: 5, hits: 375 });
    const checkpoints = await env.DB.prepare(`
      SELECT status, COUNT(*) AS count FROM analytics_collection_days GROUP BY status
    `).all();
    expect(checkpoints.results).toEqual(expect.arrayContaining([
      { status: 'pending', count: 25 },
      { status: 'succeeded', count: 5 },
    ]));
    const run = await env.DB.prepare(
      'SELECT status, trigger_type, category FROM sync_job_runs WHERE id = ?',
    ).bind(result.job_run_id).first();
    expect(run).toEqual({ status: 'succeeded', trigger_type: 'manual', category: 'analytics' });
  });
});
