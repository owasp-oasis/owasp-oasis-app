import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { runSyncOneCommentReaction } from '../../../worker/sync.js';
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
});
