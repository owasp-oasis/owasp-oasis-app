import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { runSyncOneCommentReaction } from '../../../worker/sync.js';
import { startBoundedLegacySync } from '../../../worker/canonicalSync.js';
import type { CanonicalSyncParams, Env } from '../../../worker/types.js';
import { applySchema, cleanDB, insertTestPR, insertTestRepo } from './helpers.js';
import { fetchMock } from './fetchMock.js';

describe('bounded canonical synchronization work', () => {
  beforeAll(async () => applySchema(env));
  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });
  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  it('collects reactions for exactly one queued comment per invocation', async () => {
    await insertTestRepo(env, { id: 101, name: 'bounded-repo' });
    await insertTestPR(env, { id: 2001, repo_id: 101, repo_name: 'bounded-repo', number: 7 });
    await env.DB.prepare(`
      INSERT INTO pr_comments (
        id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at
      ) VALUES (3001, 2001, 'bounded-repo', 7, 'reviewer', 'accept', ?, ?)
    `).bind(new Date().toISOString(), new Date().toISOString()).run();
    await env.DB.prepare(`
      INSERT INTO sync_work_items (
        id, pipeline_run_id, job_run_id, job_key, entity_type, entity_id,
        payload_json, status, created_at, updated_at
      ) VALUES ('work-3001', 'pipeline-1', 'job-1', 'comment_reactions',
        'comment', '3001', '{}', 'pending', ?, ?)
    `).bind(new Date().toISOString(), new Date().toISOString()).run();

    fetchMock.when(request => request.url === (
      'https://api.github.com/repos/owasp-oasis/bounded-repo/issues/comments/3001/reactions?per_page=100&page=1'
    )).respondWith(Response.json([
      { user: { login: 'peer-reviewer' }, content: '+1' },
      { user: { login: 'reviewer' }, content: 'heart' },
    ]));

    await expect(runSyncOneCommentReaction(env, 'pipeline-1')).resolves.toEqual({
      done: false,
      reactions: 1,
    });
    await expect(runSyncOneCommentReaction(env, 'pipeline-1')).resolves.toEqual({
      done: true,
      reactions: 0,
    });

    const reactions = await env.DB.prepare(
      'SELECT comment_id, reactor, content FROM comment_reactions',
    ).all<{ comment_id: number; reactor: string; content: string }>();
    expect(reactions.results).toEqual([{
      comment_id: 3001,
      reactor: 'peer-reviewer',
      content: '+1',
    }]);
  });

  it('dispatches the legacy schedule through the bounded Workspace Workflow', async () => {
    const created: Array<{ id?: string; params: CanonicalSyncParams }> = [];
    const workflow = {
      async create(options: { id?: string; params: CanonicalSyncParams }) {
        created.push(options);
        return { id: options.id ?? 'generated-workflow-id' };
      },
    };
    const productionEnv = {
      ...env,
      ENVIRONMENT: 'production',
      CANONICAL_SYNC_WORKFLOW: workflow,
    } as Env;

    const dispatch = await startBoundedLegacySync(productionEnv);

    expect(dispatch).toEqual(expect.objectContaining({
      started: true,
      pipelineRunId: expect.any(String),
      workflowInstanceId: expect.stringContaining('legacy-inventory'),
    }));
    expect(created).toHaveLength(1);
    expect(created[0].params).toEqual({
      action: 'inventory',
      pipelineRunId: dispatch.pipelineRunId,
      pipelineKind: 'legacy',
    });

    const runs = await env.DB.prepare(`
      SELECT job_key, mode, status FROM sync_job_runs
       WHERE pipeline_run_id = ? ORDER BY created_at, job_key
    `).bind(dispatch.pipelineRunId).all<{ job_key: string; mode: string; status: string }>();
    expect(runs.results).toHaveLength(10);
    expect(runs.results).toContainEqual({
      job_key: 'legacy_workspace_sync', mode: 'legacy', status: 'running',
    });
    expect(runs.results.filter(run => run.job_key !== 'legacy_workspace_sync'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ job_key: 'repository_inventory', mode: 'legacy', status: 'queued' }),
        expect.objectContaining({ job_key: 'orphan_cleanup', mode: 'legacy', status: 'queued' }),
      ]));

    const state = await env.DB.prepare(
      "SELECT value FROM sync_state WHERE key = 'workspace_pipeline_kind'",
    ).first<{ value: string }>();
    expect(state?.value).toBe('legacy');
  });
});
