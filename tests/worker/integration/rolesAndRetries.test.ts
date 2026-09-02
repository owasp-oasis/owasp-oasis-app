import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { handleRetrySyncJob } from '../../../worker/handlers/syncRetry.js';
import { finishSyncJob, startSyncJob } from '../../../worker/syncJobs.js';
import type { Env } from '../../../worker/types.js';
import { fetchMock } from './fetchMock.js';
import {
  applySchema,
  buildCookieHeader,
  cleanDB,
  createTestSession,
  insertTestRepo,
  makeCsrf,
} from './helpers.js';
import { SELF } from './testWorker.js';

function retryRequest(jobKey: string, sessionCookie?: string, tokenCookie?: string, csrf?: string): Request {
  const headers = new Headers();
  if (sessionCookie && tokenCookie) {
    headers.set('Cookie', buildCookieHeader(
      sessionCookie,
      tokenCookie,
      `__csrf=${csrf ?? ''}`,
    ));
  }
  if (csrf) headers.set('x-csrf-token', csrf);
  return new Request(`http://localhost/api/admin/sync/jobs/${jobKey}/retry`, {
    method: 'POST',
    headers,
  });
}

describe('server-side roles and sync retries', () => {
  beforeAll(async () => applySchema(env));

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  it('resolves guests, ordinary members, and the seeded administrator', async () => {
    const guestResponse = await SELF.fetch(new Request('http://localhost/api/auth/me'));
    await expect(guestResponse.json()).resolves.toEqual(expect.objectContaining({
      user: null,
      role: 'guest',
    }));

    const member = await createTestSession(env, { github_user_id: 101, github_login: 'ordinary-member' });
    const memberResponse = await SELF.fetch(new Request('http://localhost/api/auth/me', {
      headers: { Cookie: buildCookieHeader(member.sessionCookie, member.tokenCookie) },
    }));
    await expect(memberResponse.json()).resolves.toEqual(expect.objectContaining({
      user: expect.objectContaining({ login: 'ordinary-member', role: 'member' }),
    }));

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const adminResponse = await SELF.fetch(new Request('http://localhost/api/auth/me', {
      headers: { Cookie: buildCookieHeader(admin.sessionCookie, admin.tokenCookie) },
    }));
    await expect(adminResponse.json()).resolves.toEqual(expect.objectContaining({
      user: expect.objectContaining({ login: 'humor4fun', role: 'admin' }),
    }));
  });

  it('recognizes humor4fun on a pre-migration session without a GitHub user ID', async () => {
    const admin = await createTestSession(env, { github_login: 'HUMOR4FUN' });
    const response = await SELF.fetch(new Request('http://localhost/api/auth/me', {
      headers: { Cookie: buildCookieHeader(admin.sessionCookie, admin.tokenCookie) },
    }));
    const body = await response.json() as { user: { role: string } };
    expect(body.user.role).toBe('admin');
  });

  it('keeps an explicitly restricted authenticated account at the guest role', async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO user_roles (
        github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
      ) VALUES (303, 'restricted-user', 'guest', 7505051, ?, ?)
    `).bind(now, now).run();
    const restricted = await createTestSession(env, {
      github_user_id: 303,
      github_login: 'restricted-user',
    });
    const response = await SELF.fetch(new Request('http://localhost/api/auth/me', {
      headers: { Cookie: buildCookieHeader(restricted.sessionCookie, restricted.tokenCookie) },
    }));
    const body = await response.json() as { user: { role: string } };
    expect(body.user.role).toBe('guest');
  });

  it('rejects guests, members, moderators, and invalid CSRF tokens', async () => {
    const guestRequest = retryRequest('repository_inventory');
    guestRequest.headers.set('X-Admin-Secret', 'shared-secret-cannot-substitute-for-a-session');
    const guestResponse = await SELF.fetch(guestRequest);
    expect(guestResponse.status).toBe(401);

    const member = await createTestSession(env, { github_user_id: 101, github_login: 'member-user' });
    const memberCsrf = makeCsrf();
    const memberResponse = await SELF.fetch(retryRequest(
      'repository_inventory', member.sessionCookie, member.tokenCookie, memberCsrf,
    ));
    expect(memberResponse.status).toBe(403);

    await env.DB.prepare(`
      INSERT INTO user_roles (
        github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
      ) VALUES (202, 'moderator-user', 'moderator', 7505051, ?, ?)
    `).bind(new Date().toISOString(), new Date().toISOString()).run();
    const moderator = await createTestSession(env, { github_user_id: 202, github_login: 'moderator-user' });
    const moderatorCsrf = makeCsrf();
    const moderatorResponse = await SELF.fetch(retryRequest(
      'repository_inventory', moderator.sessionCookie, moderator.tokenCookie, moderatorCsrf,
    ));
    expect(moderatorResponse.status).toBe(403);

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const cookieCsrf = makeCsrf();
    const invalidCsrfResponse = await SELF.fetch(new Request(
      'http://localhost/api/admin/sync/jobs/repository_inventory/retry',
      {
        method: 'POST',
        headers: {
          Cookie: buildCookieHeader(admin.sessionCookie, admin.tokenCookie, `__csrf=${cookieCsrf}`),
          'x-csrf-token': makeCsrf(),
        },
      },
    ));
    expect(invalidCsrfResponse.status).toBe(403);
  });

  it('lets an admin retry an incomplete repository inventory and audits the action', async () => {
    const productionEnv = { ...env, ENVIRONMENT: 'production' } as Env;
    await insertTestRepo(env, { id: 101, name: 'current-fork' });
    const failedRunId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory', trigger: 'scheduled', mode: 'legacy',
    });
    await finishSyncJob(env.DB, failedRunId, 'failed', {
      errorCode: 'github_request_failed', error: 'Temporary GitHub failure',
    });

    fetchMock.when(request => request.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=1'
    )).respondWith(Response.json([{ id: 101, name: 'current-fork', fork: true }]));
    fetchMock.when(request => request.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=2'
    )).respondWith(Response.json([]));

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();
    const ctx = createExecutionContext();
    const response = await handleRetrySyncJob(
      retryRequest('repository_inventory', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      ctx,
      'repository_inventory',
    );

    expect(response.status).toBe(202);
    const body = await response.json() as { retry_run_id: string; retried_run_id: string };
    expect(body.retried_run_id).toBe(failedRunId);
    await waitOnExecutionContext(ctx);

    const retried = await env.DB.prepare(
      'SELECT status, trigger_type, mode FROM sync_job_runs WHERE id = ?',
    ).bind(body.retry_run_id).first<{ status: string; trigger_type: string; mode: string }>();
    expect(retried).toEqual({ status: 'succeeded', trigger_type: 'manual', mode: 'live' });

    const audit = await env.DB.prepare(`
      SELECT github_user_id, github_login, role, action, target_id, outcome
        FROM privileged_action_audit ORDER BY created_at
    `).all();
    expect(audit.results).toEqual([
      expect.objectContaining({
        github_user_id: 7505051, github_login: 'humor4fun', role: 'admin',
        action: 'sync_job.retry', target_id: 'repository_inventory', outcome: 'accepted',
      }),
      expect.objectContaining({
        github_user_id: 7505051, github_login: 'humor4fun', role: 'admin',
        action: 'sync_job.retry', target_id: 'repository_inventory', outcome: 'succeeded',
      }),
    ]);
  });

  it('refuses unsupported, complete, and currently active jobs for an administrator', async () => {
    const productionEnv = { ...env, ENVIRONMENT: 'production' } as Env;
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();

    const unsupported = await handleRetrySyncJob(
      retryRequest('pull_request_catalog', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      createExecutionContext(),
      'pull_request_catalog',
    );
    expect(unsupported.status).toBe(409);

    const completeRunId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory', trigger: 'scheduled', mode: 'legacy',
    });
    await finishSyncJob(env.DB, completeRunId, 'succeeded');
    const complete = await handleRetrySyncJob(
      retryRequest('repository_inventory', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      createExecutionContext(),
      'repository_inventory',
    );
    expect(complete.status).toBe(409);

    const failedRunId = await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', trigger: 'scheduled', mode: 'legacy',
    });
    await finishSyncJob(env.DB, failedRunId, 'failed');
    await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', trigger: 'scheduled', mode: 'legacy', status: 'queued',
    });
    const active = await handleRetrySyncJob(
      retryRequest('orphan_cleanup', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      createExecutionContext(),
      'orphan_cleanup',
    );
    expect(active.status).toBe(409);
  });
});
