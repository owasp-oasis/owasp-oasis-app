import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  initializeManualSyncJob,
  processManualSyncJobChunk,
} from '../../../worker/manualSyncJobWorkflow.js';
import { startSyncJob } from '../../../worker/syncJobs.js';
import type { Env, ManualSyncJobParams } from '../../../worker/types.js';
import {
  applySchema,
  cleanDB,
  insertTestPR,
  insertTestRepo,
} from './helpers.js';

const auditActor = {
  githubUserId: 7505051,
  githubLogin: 'humor4fun',
  role: 'admin' as const,
};

describe('bounded manual synchronization jobs', () => {
  beforeAll(async () => applySchema(env));
  afterEach(async () => cleanDB(env));

  it('projects votes as a separately tracked terminal job', async () => {
    await insertTestRepo(env, { id: 101, name: 'manual-job-repo' });
    await insertTestPR(env, {
      id: 2001,
      repo_id: 101,
      repo_name: 'manual-job-repo',
      number: 7,
    });
    const timestamp = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO pr_comments (
        id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at
      ) VALUES (3001, 2001, 'manual-job-repo', 7, 'reviewer', 'accept', ?, ?)
    `).bind(timestamp, timestamp).run();
    const pipelineRunId = crypto.randomUUID();
    const jobRunId = await startSyncJob(env.DB, {
      jobKey: 'vote_projection',
      pipelineRunId,
      trigger: 'manual',
      mode: 'live',
      status: 'queued',
    });
    const params: ManualSyncJobParams = {
      jobRunId,
      pipelineRunId,
      jobKey: 'vote_projection',
      pipeline: 'canonical',
      chunk: 0,
      auditActor,
    };

    await expect(processManualSyncJobChunk(env, params, 1)).resolves.toEqual({
      done: true,
      votes: 1,
    });

    const vote = await env.DB.prepare(`
      SELECT github_login, pr_id, decision FROM user_votes
    `).first<{ github_login: string; pr_id: number; decision: string }>();
    expect(vote).toEqual({ github_login: 'reviewer', pr_id: 2001, decision: 'accept' });

    const run = await env.DB.prepare(`
      SELECT status, completed_items, metrics_json FROM sync_job_runs WHERE id = ?
    `).bind(jobRunId).first<{ status: string; completed_items: number; metrics_json: string }>();
    expect(run?.status).toBe('succeeded');
    expect(run?.completed_items).toBe(1);
    expect(JSON.parse(run?.metrics_json ?? '{}')).toEqual({ bounded_workflow: true, votes: 1 });

    const audit = await env.DB.prepare(`
      SELECT action, target_id, outcome FROM privileged_action_audit ORDER BY created_at DESC LIMIT 1
    `).first<{ action: string; target_id: string; outcome: string }>();
    expect(audit).toEqual({
      action: 'sync_job.retry',
      target_id: 'canonical:vote_projection',
      outcome: 'succeeded',
    });
  });

  it('snapshots comment reactions before dispatching their first Workflow slice', async () => {
    await insertTestRepo(env, { id: 202, name: 'reaction-job-repo' });
    await insertTestPR(env, {
      id: 4001,
      repo_id: 202,
      repo_name: 'reaction-job-repo',
      number: 9,
    });
    const timestamp = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO pr_comments (
        id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at
      ) VALUES
        (5001, 4001, 'reaction-job-repo', 9, 'first-reviewer', 'accept', ?, ?),
        (5002, 4001, 'reaction-job-repo', 9, 'second-reviewer', 'modify', ?, ?)
    `).bind(timestamp, timestamp, timestamp, timestamp).run();
    const pipelineRunId = crypto.randomUUID();
    const jobRunId = await startSyncJob(env.DB, {
      jobKey: 'comment_reactions',
      pipelineRunId,
      trigger: 'manual',
      mode: 'legacy',
      status: 'queued',
    });
    const created: Array<{ params: ManualSyncJobParams }> = [];
    const workflowEnv = {
      ...env,
      MANUAL_SYNC_JOB_WORKFLOW: {
        async create(options: { params: ManualSyncJobParams }) {
          created.push(options);
          return { id: 'manual-reaction-workflow' };
        },
      },
    } as Env;

    await expect(initializeManualSyncJob(workflowEnv, {
      jobRunId,
      pipelineRunId,
      jobKey: 'comment_reactions',
      pipeline: 'legacy',
      auditActor,
    })).resolves.toBe('manual-reaction-workflow');

    const run = await env.DB.prepare(`
      SELECT expected_items, workflow_instance_id FROM sync_job_runs WHERE id = ?
    `).bind(jobRunId).first<{ expected_items: number; workflow_instance_id: string }>();
    expect(run).toEqual({ expected_items: 2, workflow_instance_id: 'manual-reaction-workflow' });
    const items = await env.DB.prepare(`
      SELECT entity_id, status FROM sync_work_items WHERE job_run_id = ? ORDER BY entity_id
    `).bind(jobRunId).all<{ entity_id: string; status: string }>();
    expect(items.results).toEqual([
      { entity_id: '5001', status: 'pending' },
      { entity_id: '5002', status: 'pending' },
    ]);
    expect(created[0].params).toEqual(expect.objectContaining({
      jobRunId,
      pipelineRunId,
      jobKey: 'comment_reactions',
      pipeline: 'legacy',
      chunk: 0,
    }));
  });
});
