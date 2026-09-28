import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handleCancelSyncRun } from '../../../worker/handlers/syncCancel.js';
import { finishSyncJob, startSyncJob } from '../../../worker/syncJobs.js';
import type { Env } from '../../../worker/types.js';
import {
  applySchema,
  buildCookieHeader,
  cleanDB,
  createTestSession,
  makeCsrf,
} from './helpers.js';

interface SessionCookies {
  sessionCookie: string;
  tokenCookie: string;
}

function cancelRequest(runId: string, session?: SessionCookies, csrf?: string): Request {
  const headers = new Headers();
  if (session) {
    headers.set('Cookie', buildCookieHeader(
      session.sessionCookie,
      session.tokenCookie,
      `__csrf=${csrf ?? ''}`,
    ));
  }
  if (csrf) headers.set('x-csrf-token', csrf);
  return new Request(`http://localhost/api/admin/sync/runs/${runId}/cancel`, {
    method: 'POST',
    headers,
  });
}

async function insertWorkItem(
  jobRunId: string,
  pipelineRunId: string,
  status: 'pending' | 'leased' = 'pending',
): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO sync_work_items (
      id, pipeline_run_id, job_run_id, job_key, entity_type, entity_id,
      payload_json, status, created_at, updated_at
    ) VALUES (?, ?, ?, 'comment_reactions', 'comment', '1', '{}', ?, ?, ?)
  `).bind(crypto.randomUUID(), pipelineRunId, jobRunId, status, now, now).run();
}

describe('administrator sync cancellation', () => {
  beforeAll(async () => applySchema(env));
  afterEach(async () => cleanDB(env));

  it('rejects guests, members, and invalid CSRF tokens', async () => {
    const runId = await startSyncJob(env.DB, {
      jobKey: 'comment_reactions', trigger: 'manual', mode: 'live', status: 'queued',
    });
    expect((await handleCancelSyncRun(cancelRequest(runId), env, runId)).status).toBe(401);

    const member = await createTestSession(env, {
      github_user_id: 101,
      github_login: 'ordinary-member',
    });
    const memberCsrf = makeCsrf();
    expect((await handleCancelSyncRun(
      cancelRequest(runId, member, memberCsrf), env, runId,
    )).status).toBe(403);

    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    expect((await handleCancelSyncRun(cancelRequest(runId, admin), env, runId)).status).toBe(403);
  });

  it('fails a standalone run, terminates its Workflow, releases work, and audits the admin', async () => {
    let terminated = false;
    const workflowInstanceId = 'manual-instance-1';
    const runId = await startSyncJob(env.DB, {
      jobKey: 'comment_reactions',
      pipelineRunId: crypto.randomUUID(),
      workflowInstanceId,
      trigger: 'manual',
      mode: 'live',
      status: 'queued',
    });
    const run = await env.DB.prepare(
      'SELECT pipeline_run_id FROM sync_job_runs WHERE id = ?',
    ).bind(runId).first<{ pipeline_run_id: string }>();
    if (!run) throw new Error('Run was not inserted');
    await insertWorkItem(runId, run.pipeline_run_id, 'leased');

    const workflowEnv = {
      ...env,
      MANUAL_SYNC_JOB_WORKFLOW: {
        async get(id: string) {
          expect(id).toBe(workflowInstanceId);
          return {
            async status() { return { status: 'running' as const }; },
            async terminate() { terminated = true; },
          };
        },
      },
    } as Env;
    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const csrf = makeCsrf();
    const response = await handleCancelSyncRun(
      cancelRequest(runId, admin, csrf), workflowEnv, runId,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      run_id: runId,
      pipeline_run_id: null,
      status: 'failed',
      workflow_termination: 'terminated',
    }));
    expect(terminated).toBe(true);
    const cancelled = await env.DB.prepare(`
      SELECT status, error_code, finished_at FROM sync_job_runs WHERE id = ?
    `).bind(runId).first<{ status: string; error_code: string; finished_at: string | null }>();
    expect(cancelled).toEqual(expect.objectContaining({
      status: 'failed',
      error_code: 'cancelled_by_admin',
      finished_at: expect.any(String),
    }));
    const work = await env.DB.prepare(`
      SELECT status, last_error_code, lease_expires_at FROM sync_work_items WHERE job_run_id = ?
    `).bind(runId).first();
    expect(work).toEqual({
      status: 'failed',
      last_error_code: 'cancelled_by_admin',
      lease_expires_at: null,
    });
    const audit = await env.DB.prepare(`
      SELECT github_user_id, action, target_type, target_id, outcome
        FROM privileged_action_audit WHERE action = 'sync_job.cancel'
    `).first();
    expect(audit).toEqual({
      github_user_id: 7505051,
      action: 'sync_job.cancel',
      target_type: 'sync_job_run',
      target_id: runId,
      outcome: 'succeeded',
    });

    await finishSyncJob(env.DB, runId, 'succeeded');
    const protectedStatus = await env.DB.prepare(
      'SELECT status, error_code FROM sync_job_runs WHERE id = ?',
    ).bind(runId).first();
    expect(protectedStatus).toEqual({ status: 'failed', error_code: 'cancelled_by_admin' });
  });

  it('cancels every active child and releases the lease for a coupled Workspace pipeline', async () => {
    let terminated = false;
    const pipelineRunId = crypto.randomUUID();
    const workflowInstanceId = 'canonical-instance-4';
    const parentId = await startSyncJob(env.DB, {
      jobKey: 'canonical_workspace_sync',
      pipelineRunId,
      workflowInstanceId,
      trigger: 'manual',
      mode: 'live',
    });
    const activeChildId = await startSyncJob(env.DB, {
      jobKey: 'comment_reactions',
      pipelineRunId,
      workflowInstanceId,
      trigger: 'continuation',
      mode: 'live',
      status: 'running',
    });
    const queuedChildId = await startSyncJob(env.DB, {
      jobKey: 'duplicate_resolution',
      pipelineRunId,
      workflowInstanceId,
      trigger: 'continuation',
      mode: 'live',
      status: 'queued',
    });
    const completedChildId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory',
      pipelineRunId,
      trigger: 'continuation',
      mode: 'live',
    });
    await finishSyncJob(env.DB, completedChildId, 'succeeded');
    await insertWorkItem(activeChildId, pipelineRunId, 'pending');
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO sync_pipeline_locks (lock_key, pipeline_run_id, acquired_at, lease_expires_at)
      VALUES ('canonical_workspace_sync', ?, ?, ?)
    `).bind(pipelineRunId, now, new Date(Date.now() + 60_000).toISOString()).run();
    await env.DB.batch([
      env.DB.prepare("UPDATE sync_state SET value = '1' WHERE key = 'sync_running'"),
      env.DB.prepare("UPDATE sync_state SET value = ? WHERE key = 'canonical_pipeline_run_id'")
        .bind(pipelineRunId),
      env.DB.prepare("UPDATE sync_state SET value = 'running' WHERE key = 'canonical_pipeline_phase'"),
    ]);

    const workflowEnv = {
      ...env,
      CANONICAL_SYNC_WORKFLOW: {
        async get() {
          return {
            async status() { return { status: 'waiting' as const }; },
            async terminate() { terminated = true; },
          };
        },
      },
    } as Env;
    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const response = await handleCancelSyncRun(
      cancelRequest(activeChildId, admin, makeCsrf()), workflowEnv, activeChildId,
    );

    expect(response.status).toBe(200);
    expect(terminated).toBe(true);
    const statuses = await env.DB.prepare(`
      SELECT id, status, error_code FROM sync_job_runs
       WHERE pipeline_run_id = ? ORDER BY id
    `).bind(pipelineRunId).all<{ id: string; status: string; error_code: string | null }>();
    expect(statuses.results).toEqual(expect.arrayContaining([
      { id: parentId, status: 'failed', error_code: 'cancelled_by_admin' },
      { id: activeChildId, status: 'failed', error_code: 'cancelled_by_admin' },
      { id: queuedChildId, status: 'failed', error_code: 'cancelled_by_admin' },
      { id: completedChildId, status: 'succeeded', error_code: null },
    ]));
    const lock = await env.DB.prepare(
      'SELECT pipeline_run_id FROM sync_pipeline_locks WHERE pipeline_run_id = ?',
    ).bind(pipelineRunId).first();
    expect(lock).toBeNull();
    const state = await env.DB.prepare(`
      SELECT key, value FROM sync_state
       WHERE key IN ('sync_running', 'canonical_pipeline_phase') ORDER BY key
    `).all();
    expect(state.results).toEqual([
      { key: 'canonical_pipeline_phase', value: 'cancelled' },
      { key: 'sync_running', value: '0' },
    ]);
  });

  it('refuses to cancel a terminal run', async () => {
    const runId = await startSyncJob(env.DB, {
      jobKey: 'repository_inventory', trigger: 'manual', mode: 'live',
    });
    await finishSyncJob(env.DB, runId, 'succeeded');
    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const response = await handleCancelSyncRun(
      cancelRequest(runId, admin, makeCsrf()), env, runId,
    );
    expect(response.status).toBe(409);
  });
});
