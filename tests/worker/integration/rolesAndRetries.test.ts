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

function retryRequest(
  jobKey: string,
  sessionCookie?: string,
  tokenCookie?: string,
  csrf?: string,
  pipeline?: 'legacy' | 'canonical' | 'shadow' | 'integration',
): Request {
  const headers = new Headers();
  if (sessionCookie && tokenCookie) {
    headers.set('Cookie', buildCookieHeader(
      sessionCookie,
      tokenCookie,
      `__csrf=${csrf ?? ''}`,
    ));
  }
  if (csrf) headers.set('x-csrf-token', csrf);
  if (pipeline) headers.set('content-type', 'application/json');
  return new Request(`http://localhost/api/admin/sync/jobs/${jobKey}/retry`, {
    method: 'POST',
    headers,
    body: pipeline ? JSON.stringify({ pipeline }) : undefined,
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
    const workflows: Array<{ params: { jobKey: string } }> = [];
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      MANUAL_SYNC_JOB_WORKFLOW: {
        async create(options: { id: string; params: { jobKey: string } }) {
          workflows.push(options);
          return { id: options.id };
        },
      },
    } as Env;
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
      retryRequest('repository_inventory', admin.sessionCookie, admin.tokenCookie, csrf, 'legacy'),
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
    expect(retried).toEqual({ status: 'queued', trigger_type: 'manual', mode: 'legacy' });
    expect(workflows).toHaveLength(1);
    expect(workflows[0].params.jobKey).toBe('repository_inventory');

    const audit = await env.DB.prepare(`
      SELECT github_user_id, github_login, role, action, target_id, outcome
        FROM privileged_action_audit ORDER BY created_at
    `).all();
    expect(audit.results).toEqual([
      expect.objectContaining({
        github_user_id: 7505051, github_login: 'humor4fun', role: 'admin',
        action: 'sync_job.retry', target_id: 'legacy:repository_inventory', outcome: 'accepted',
      }),
    ]);
  });

  it('lets an administrator run every implemented job but refuses active jobs', async () => {
    const productionEnv = { ...env, ENVIRONMENT: 'production' } as Env;
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();

    const catalogCtx = createExecutionContext();
    const catalog = await handleRetrySyncJob(
      retryRequest('pull_request_catalog', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      catalogCtx,
      'pull_request_catalog',
    );
    expect(catalog.status).toBe(202);
    await waitOnExecutionContext(catalogCtx);

    const completeRunId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory', trigger: 'scheduled', mode: 'legacy',
    });
    await finishSyncJob(env.DB, completeRunId, 'succeeded');

    await insertTestRepo(env, { id: 101, name: 'current-fork' });
    fetchMock.when(request => request.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=1'
    )).respondWith(Response.json([{ id: 101, name: 'current-fork', fork: true }]));
    fetchMock.when(request => request.url === (
      'https://api.github.com/orgs/owasp-oasis/repos?type=public&per_page=100&page=2'
    )).respondWith(Response.json([]));

    const completeCtx = createExecutionContext();
    const complete = await handleRetrySyncJob(
      retryRequest('repository_inventory', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      completeCtx,
      'repository_inventory',
    );
    expect(complete.status).toBe(202);
    await waitOnExecutionContext(completeCtx);

    const neverRunCtx = createExecutionContext();
    const neverRun = await handleRetrySyncJob(
      retryRequest('hubspot_contacts', admin.sessionCookie, admin.tokenCookie, csrf),
      productionEnv,
      neverRunCtx,
      'hubspot_contacts',
    );
    expect(neverRun.status).toBe(202);
    await expect(neverRun.json()).resolves.toEqual(expect.objectContaining({
      retried_run_id: null,
    }));
    await waitOnExecutionContext(neverRunCtx);

    const firstHubSpotRun = await env.DB.prepare(`
      SELECT status, trigger_type, mode FROM sync_job_runs
       WHERE job_key = 'hubspot_contacts' ORDER BY started_at DESC LIMIT 1
    `).first<{ status: string; trigger_type: string; mode: string }>();
    expect(firstHubSpotRun).toEqual({ status: 'failed', trigger_type: 'manual', mode: 'live' });

    const failedRunId = await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', trigger: 'scheduled', mode: 'legacy',
    });
    await finishSyncJob(env.DB, failedRunId, 'failed');
    await startSyncJob(env.DB, {
      jobKey: 'orphan_cleanup', trigger: 'scheduled', mode: 'legacy', status: 'queued',
    });
    const active = await handleRetrySyncJob(
      retryRequest('orphan_cleanup', admin.sessionCookie, admin.tokenCookie, csrf, 'legacy'),
      productionEnv,
      createExecutionContext(),
      'orphan_cleanup',
    );
    expect(active.status).toBe(409);
  });

  it('dispatches every standalone Workspace stage through its bounded manual Workflow', async () => {
    const created: Array<{ id: string; params: { jobKey: string; pipeline: string } }> = [];
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      MANUAL_SYNC_JOB_WORKFLOW: {
        async create(options: { id: string; params: { jobKey: string; pipeline: string } }) {
          created.push(options);
          return { id: options.id };
        },
      },
    } as Env;
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();
    const jobKeys = [
      'pull_request_catalog',
      'upstream_merge_status',
      'pull_request_comments',
      'comment_reactions',
      'vote_projection',
      'duplicate_resolution',
      'contributor_scores',
    ];

    for (const jobKey of jobKeys) {
      const ctx = createExecutionContext();
      const response = await handleRetrySyncJob(
        retryRequest(jobKey, admin.sessionCookie, admin.tokenCookie, csrf, 'canonical'),
        productionEnv,
        ctx,
        jobKey,
      );
      expect(response.status, jobKey).toBe(202);
      const body = await response.json() as { retry_run_id: string; execution_scope: string };
      expect(body.execution_scope).toBe('individual_job');
      await waitOnExecutionContext(ctx);
      await finishSyncJob(env.DB, body.retry_run_id, 'succeeded');
    }

    expect(created.map(entry => entry.params)).toEqual(jobKeys.map(jobKey => ({
      jobKey,
      pipeline: 'canonical',
      jobRunId: expect.any(String),
      pipelineRunId: expect.any(String),
      chunk: 0,
      auditActor: expect.objectContaining({ githubLogin: 'humor4fun', role: 'admin' }),
    })));
  });

  it('dispatches legacy, canonical, and shadow parent runs with manual tracking', async () => {
    const workspaceDispatches: Array<{ params: { action: string; pipelineKind?: string } }> = [];
    const shadowDispatches: Array<{ params: { action: string; legacyPipelineRunId: string } }> = [];
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      CANONICAL_SYNC_WORKFLOW: {
        async create(options: { params: { action: string; pipelineKind?: string } }) {
          workspaceDispatches.push(options);
          return { id: `${options.params.pipelineKind}-workflow` };
        },
      },
      SHADOW_SYNC_WORKFLOW: {
        async create(options: { params: { action: string; legacyPipelineRunId: string } }) {
          shadowDispatches.push(options);
          return { id: 'shadow-workflow' };
        },
      },
    } as Env;
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();

    for (const target of [
      { jobKey: 'legacy_workspace_sync', pipeline: 'legacy' as const },
      { jobKey: 'canonical_workspace_sync', pipeline: 'canonical' as const },
    ]) {
      const response = await handleRetrySyncJob(
        retryRequest(target.jobKey, admin.sessionCookie, admin.tokenCookie, csrf, target.pipeline),
        productionEnv,
        createExecutionContext(),
        target.jobKey,
      );
      expect(response.status, target.jobKey).toBe(202);
      await env.DB.prepare(
        "UPDATE sync_job_runs SET status = 'succeeded', finished_at = ? WHERE status IN ('queued', 'running')",
      ).bind(new Date().toISOString()).run();
      await env.DB.prepare('DELETE FROM sync_pipeline_locks').run();
    }

    const shadow = await handleRetrySyncJob(
      retryRequest('shadow_sync_dispatch', admin.sessionCookie, admin.tokenCookie, csrf, 'shadow'),
      productionEnv,
      createExecutionContext(),
      'shadow_sync_dispatch',
    );
    expect(shadow.status).toBe(202);
    expect(workspaceDispatches.map(item => item.params)).toEqual([
      expect.objectContaining({ action: 'inventory', pipelineKind: 'legacy' }),
      expect.objectContaining({ action: 'inventory', pipelineKind: 'canonical' }),
    ]);
    expect(shadowDispatches).toHaveLength(1);

    const shadowRun = await env.DB.prepare(`
      SELECT trigger_type, mode FROM sync_job_runs
       WHERE job_key = 'shadow_sync_dispatch' ORDER BY started_at DESC LIMIT 1
    `).first<{ trigger_type: string; mode: string }>();
    expect(shadowRun).toEqual({ trigger_type: 'manual', mode: 'shadow' });
  });
});
