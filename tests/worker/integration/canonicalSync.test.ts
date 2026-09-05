import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { runSyncOneCommentReaction, seedCommentReactionWorkItems } from '../../../worker/sync.js';
import { startBoundedLegacySync } from '../../../worker/canonicalSync.js';
import {
  clearPRReviewProjection,
  reconcileCurrentParticipants,
  rebuildContributors,
  syncVotesFromComments,
} from '../../../worker/db.js';
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

  it('seeds every current comment for a bounded reaction refresh without duplicates', async () => {
    await insertTestRepo(env, { id: 102, name: 'reaction-inventory' });
    await insertTestPR(env, { id: 2002, repo_id: 102, repo_name: 'reaction-inventory', number: 8 });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3002, 2002, 'reaction-inventory', 8, 'one', 'accept', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3003, 2002, 'reaction-inventory', 8, 'two', 'modify', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(`INSERT INTO sync_work_items
        (id, pipeline_run_id, job_run_id, job_key, entity_type, entity_id,
         payload_json, status, created_at, updated_at)
        VALUES ('existing-reaction', 'pipeline-all', 'job-all', 'comment_reactions',
          'comment', '3002', '{}', 'pending', ?, ?)`
      ).bind(now, now),
    ]);

    await expect(seedCommentReactionWorkItems(env.DB, 'job-all', 'pipeline-all'))
      .resolves.toBe(2);
    const work = await env.DB.prepare(`
      SELECT entity_id FROM sync_work_items
       WHERE pipeline_run_id = 'pipeline-all' AND job_key = 'comment_reactions'
       ORDER BY entity_id
    `).all<{ entity_id: string }>();
    expect(work.results).toEqual([{ entity_id: '3002' }, { entity_id: '3003' }]);
  });

  it('replaces stale per-PR review rows before inserting a fresh GitHub snapshot', async () => {
    await insertTestRepo(env, { id: 103, name: 'review-snapshot' });
    await insertTestPR(env, { id: 2003, repo_id: 103, repo_name: 'review-snapshot', number: 9 });
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3004, 2003, 'review-snapshot', 9, 'removed-reviewer', 'accept', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(`INSERT INTO comment_reactions (comment_id, reactor, content, is_positive)
        VALUES (3004, 'peer', '+1', 1)`),
      env.DB.prepare(`INSERT INTO pr_participants
        (pr_id, repo_name, pr_number, login, interactions, decision)
        VALUES (2003, 'review-snapshot', 9, 'removed-reviewer', 1, 'accept')`),
    ]);

    await clearPRReviewProjection(env.DB, 2003);

    for (const table of ['pr_comments', 'comment_reactions', 'pr_participants']) {
      const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .first<{ count: number }>();
      expect(row?.count).toBe(0);
    }
  });

  it('reconciles current GitHub comments while preserving UI vote timestamps', async () => {
    await insertTestRepo(env, { id: 104, name: 'vote-projection' });
    await insertTestPR(env, { id: 2004, repo_id: 104, repo_name: 'vote-projection', number: 10 });
    const commentTime = '2026-09-01T12:00:00.000Z';
    const uiVoteTime = '2026-09-01T12:00:02.000Z';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3005, 2004, 'vote-projection', 10, 'ui-reviewer', 'accept', ?, ?)`
      ).bind(commentTime, commentTime),
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3006, 2004, 'vote-projection', 10, 'legacy-reviewer', 'modify', ?, ?)`
      ).bind(commentTime, commentTime),
      env.DB.prepare(`INSERT INTO user_votes
        (github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at)
        VALUES ('ui-reviewer', 2004, 'vote-projection', 10, 'accept', 3005, ?)`
      ).bind(uiVoteTime),
      env.DB.prepare(`INSERT INTO user_votes
        (github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at)
        VALUES ('legacy-reviewer', 2004, 'vote-projection', 10, 'modify', NULL, ?)`
      ).bind(commentTime),
      env.DB.prepare(`INSERT INTO user_votes
        (github_login, pr_id, repo_name, pr_number, decision, comment_id, voted_at)
        VALUES ('removed-reviewer', 2004, 'vote-projection', 10, 'reject', 9999, ?)`
      ).bind(commentTime),
    ]);

    await syncVotesFromComments(env.DB);

    const votes = await env.DB.prepare(`
      SELECT github_login, comment_id, voted_at FROM user_votes ORDER BY github_login
    `).all<{ github_login: string; comment_id: number | null; voted_at: string }>();
    expect(votes.results).toEqual([
      { github_login: 'legacy-reviewer', comment_id: 3006, voted_at: commentTime },
      { github_login: 'ui-reviewer', comment_id: 3005, voted_at: uiVoteTime },
    ]);
  });

  it('removes current participant rows that have no review source', async () => {
    await insertTestRepo(env, { id: 107, name: 'participant-reconcile' });
    await insertTestPR(env, { id: 2007, repo_id: 107, repo_name: 'participant-reconcile', number: 13 });
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pr_participants
        (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision)
        VALUES (2007, 'participant-reconcile', 13, 'stale-decision', 1, 0, 'accept')`),
      env.DB.prepare(`INSERT INTO pr_participants
        (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision)
        VALUES (2007, 'participant-reconcile', 13, 'reaction-only', 0, 0, NULL)`),
      env.DB.prepare(`INSERT INTO pr_participants
        (pr_id, repo_name, pr_number, login, interactions, non_oasis_interactions, decision)
        VALUES (2007, 'participant-reconcile', 13, 'discussion-only', 0, 2, NULL)`),
    ]);

    await expect(reconcileCurrentParticipants(env.DB)).resolves.toBe(2);
    const participants = await env.DB.prepare(
      'SELECT login FROM pr_participants ORDER BY login',
    ).all<{ login: string }>();
    expect(participants.results).toEqual([{ login: 'discussion-only' }]);
  });

  it('builds contributor scores only from active repositories and current PRs', async () => {
    await insertTestRepo(env, { id: 105, name: 'active-score' });
    await insertTestRepo(env, { id: 106, name: 'inactive-score' });
    await env.DB.prepare('UPDATE repos SET active = 0 WHERE id = 106').run();
    await insertTestPR(env, { id: 2005, repo_id: 105, repo_name: 'active-score', number: 11 });
    await insertTestPR(env, { id: 2006, repo_id: 106, repo_name: 'inactive-score', number: 12 });
    await env.DB.prepare('UPDATE pull_requests SET deleted = 1 WHERE id = 2006').run();
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3007, 2005, 'active-score', 11, 'current-reviewer', 'accept', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(`INSERT INTO pr_comments
        (id, pr_id, repo_name, pr_number, login, decision, created_at, pr_created_at)
        VALUES (3008, 2006, 'inactive-score', 12, 'stale-reviewer', 'accept', ?, ?)`
      ).bind(now, now),
      env.DB.prepare(`INSERT INTO contributors
        (login, avatar_url, synced_at) VALUES ('stale-reviewer', NULL, ?)`
      ).bind(now),
    ]);

    await rebuildContributors(env.DB, now);

    const contributors = await env.DB.prepare(`
      SELECT login, comment_score FROM contributors ORDER BY login
    `).all<{ login: string; comment_score: number }>();
    expect(contributors.results).toEqual([
      { login: 'current-reviewer', comment_score: 1 },
    ]);
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
