/** Integration coverage for maintainer disposition and upstream submission. */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';
import {
  applySchema,
  buildCookieHeader,
  cleanDB,
  createTestSession,
  insertTestPR,
  insertTestRepo,
  makeCsrf,
} from './helpers.js';

function requestWithSession(
  path: string,
  session: { sessionCookie: string; tokenCookie: string },
  csrf: string,
  body: unknown,
): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      Cookie: buildCookieHeader(session.sessionCookie, session.tokenCookie, `__csrf=${csrf}`),
      'content-type': 'application/json',
      'x-csrf-token': csrf,
    },
    body: JSON.stringify(body),
  });
}

describe('maintainer and upstream workflow', () => {
  beforeAll(async () => applySchema(env));

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  it('returns 401 for unauthenticated POST requests to both mutation endpoints', async () => {
    await insertTestPR(env);
    const csrf = makeCsrf();

    const noSessionDecision = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/maintainer-decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, Cookie: `__csrf=${csrf}` },
      body: JSON.stringify({ decision: 'accepted', reason: 'Looks good' }),
    }));
    expect(noSessionDecision.status).toBe(401);

    const noSessionUpstream = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/submit-upstream', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, Cookie: `__csrf=${csrf}` },
      body: JSON.stringify({ confirm: true }),
    }));
    expect(noSessionUpstream.status).toBe(401);
  });

  it('hides error_summary from public GET but exposes it to admin POST responses', async () => {
    await insertTestPR(env);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO upstream_submissions (
        id, source_pr_id, upstream_full_name, upstream_default_branch,
        upstream_pr_id, upstream_pr_number, upstream_pr_node_id, upstream_pr_url,
        head_repo_full_name, head_branch, validated_head_sha, base_branch,
        status, submitted_by_login, error_summary, created_at, updated_at
      ) VALUES ('sub-err', 1001, 'upstream/project', 'main', null, null, null, null,
        'owasp-oasis/test-repo', 'fix/sql', 'abc123', 'main',
        'failed', 'humor4fun', 'GitHub API 422: {"message":"Validation Failed"}', ?, ?)
    `).bind(now, now).run();

    const publicGet = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/workflow'));
    const publicBody = await publicGet.json();
    expect(publicBody.upstream_submission.error_summary).toBeNull();

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();
    await env.DB.prepare(`INSERT INTO maintainer_decisions (id, pr_id, decision, reason, head_sha, github_user_id, github_login, created_at) VALUES ('d1', 1001, 'accepted', 'ready', null, 7505051, 'humor4fun', ?)`).bind(now).run();

    const adminPost = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/maintainer-decision', admin, csrf,
      { decision: 'accepted', reason: 'ready' },
    ));
    const adminBody = await adminPost.json();
    expect(adminBody.upstream_submission.error_summary).toBe('GitHub API 422: {"message":"Validation Failed"}');
  });

  it('keeps validator decisions separate and records an append-only maintainer history', async () => {
    await insertTestPR(env);
    await env.DB.prepare(`UPDATE pull_requests SET participants = 10, consensus_accept = 8, head_sha = 'before-revision' WHERE id = 1001`).run();
    const member = await createTestSession(env, { github_user_id: 101, github_login: 'ordinary-member' });
    const csrf = makeCsrf();

    const forbidden = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/maintainer-decision', member, csrf,
      { decision: 'accepted', reason: 'Looks good' },
    ));
    expect(forbidden.status).toBe(403);

    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const accepted = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/maintainer-decision', admin, csrf,
      { decision: 'accepted', reason: 'Community consensus is strong.' },
    ));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).status).toBe('Maintainer Accepted');

    const duplicate = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/maintainer-decision', admin, csrf,
      { decision: 'accepted', reason: 'Community consensus is strong.' },
    ));
    expect(duplicate.status).toBe(200);

    const revised = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/maintainer-decision', admin, csrf,
      { decision: 'changes_requested', reason: 'Please add a regression test.' },
    ));
    expect((await revised.json()).status).toBe('Changes Requested');

    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'after-revision' WHERE id = 1001").run();
    const returnedToReview = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/workflow'));
    expect((await returnedToReview.json()).status).toBe('Maintainer Review');

    const history = await env.DB.prepare(
      'SELECT decision, reason FROM maintainer_decisions WHERE pr_id = 1001 ORDER BY created_at ASC, id ASC',
    ).all<{ decision: string; reason: string }>();
    expect(history.results).toHaveLength(2);
    expect(history.results.map(row => row.decision)).toEqual(['accepted', 'changes_requested']);

    const workflow = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/workflow'));
    expect((await workflow.json()).maintainer_decision.reason).toBe('Please add a regression test.');

    const audit = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM privileged_action_audit WHERE action = 'maintainer_decision'",
    ).first<{ count: number }>();
    expect(audit?.count).toBe(3);
  });

  it('creates a distinct cross-fork upstream PR only after maintainer acceptance', async () => {
    await insertTestRepo(env, { name: 'test-repo' });
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE name = 'test-repo'").run();
    await insertTestPR(env);
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();

    const beforeAcceptance = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/submit-upstream', admin, csrf, { confirm: true },
    ));
    expect(beforeAcceptance.status).toBe(409);

    await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/maintainer-decision', admin, csrf,
      { decision: 'accepted', reason: 'Ready for upstream review.' },
    ));

    fetchMock.when(req => req.method === 'GET' && req.url.includes('/repos/owasp-oasis/test-repo/pulls/1'))
      .respondWith(new Response(JSON.stringify({
        number: 1,
        title: 'Fix SQL injection',
        state: 'open',
        html_url: 'https://github.com/owasp-oasis/test-repo/pull/1',
        body: 'Candidate fix',
        head: { sha: 'abc123456789', ref: 'fix/sql-injection', repo: { full_name: 'owasp-oasis/test-repo' } },
      }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/upstream/project')
      .respondWith(new Response(JSON.stringify({ full_name: 'upstream/project', default_branch: 'main' }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'POST' && req.url === 'https://api.github.com/repos/upstream/project/pulls')
      .respondWith(new Response(JSON.stringify({
        id: 9001,
        number: 42,
        html_url: 'https://github.com/upstream/project/pull/42',
        state: 'open',
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));

    const submitted = await SELF.fetch(requestWithSession(
      '/api/pr-panel/1001/submit-upstream', admin, csrf, { confirm: true },
    ));
    expect(submitted.status).toBe(200);
    const submittedBody = await submitted.json();
    expect(submittedBody.status).toBe('Submitted Upstream');
    expect(submittedBody.upstream_submission.upstream_pr_url).toBe('https://github.com/upstream/project/pull/42');

    const source = await env.DB.prepare(
      'SELECT upstream_full_name, upstream_pr_number, head_repo_full_name, head_branch, validated_head_sha, base_branch, status FROM upstream_submissions WHERE source_pr_id = 1001',
    ).first<Record<string, unknown>>();
    expect(source).toEqual(expect.objectContaining({
      upstream_full_name: 'upstream/project',
      upstream_pr_number: 42,
      head_repo_full_name: 'owasp-oasis/test-repo',
      head_branch: 'fix/sql-injection',
      validated_head_sha: 'abc123456789',
      base_branch: 'main',
      status: 'open',
    }));
  });

  it('communicates upstream review requests and merge outcomes on refresh', async () => {
    await insertTestPR(env);
    await env.DB.prepare(`
      INSERT INTO upstream_submissions (
        id, source_pr_id, upstream_full_name, upstream_default_branch,
        upstream_pr_id, upstream_pr_number, upstream_pr_node_id, upstream_pr_url,
        head_repo_full_name, head_branch, validated_head_sha, base_branch,
        status, submitted_by_login, created_at, updated_at
      ) VALUES ('submission-1', 1001, 'upstream/project', 'main', 9001, 42, 'MD_kwDO1',
        'https://github.com/upstream/project/pull/42', 'owasp-oasis/test-repo',
        'fix/sql-injection', 'abc123456789', 'main', 'open', 'humor4fun', ?, ?)
    `).bind(new Date().toISOString(), new Date().toISOString()).run();

    fetchMock.when(req => req.method === 'GET' && req.url.endsWith('/repos/upstream/project/pulls/42'))
      .respondWith(new Response(JSON.stringify({
        id: 9001, number: 42, state: 'open', html_url: 'https://github.com/upstream/project/pull/42', merged_at: null,
      }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'GET' && req.url.endsWith('/repos/upstream/project/pulls/42/reviews'))
      .respondWith(new Response(JSON.stringify([{ id: 7, state: 'CHANGES_REQUESTED', user: { login: 'upstream-maintainer' }, html_url: 'https://github.com/upstream/project/pull/42#review-7', submitted_at: '2026-09-13T10:00:00.000Z' }]), { headers: { 'Content-Type': 'application/json' } }));

    const requested = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/workflow'));
    const requestedBody = await requested.json();
    expect(requestedBody.status).toBe('Upstream Changes Requested');
    expect(requestedBody.upstream_submission.last_reviewed_by).toBe('upstream-maintainer');

    fetchMock.deactivate();
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock.when(req => req.method === 'GET' && req.url.endsWith('/repos/upstream/project/pulls/42'))
      .respondWith(new Response(JSON.stringify({
        id: 9001, number: 42, state: 'closed', html_url: 'https://github.com/upstream/project/pull/42', merged_at: '2026-09-13T11:00:00.000Z',
      }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'GET' && req.url.endsWith('/repos/upstream/project/pulls/42/reviews'))
      .respondWith(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } }));
    const merged = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/workflow'));
    expect((await merged.json()).status).toBe('Merged Upstream');
    const compatibility = await env.DB.prepare('SELECT merged_upstream, merged_at FROM pull_requests WHERE id = 1001').first<{ merged_upstream: number; merged_at: string }>();
    expect(compatibility?.merged_upstream).toBe(1);
    expect(compatibility?.merged_at).toBe('2026-09-13T11:00:00.000Z');
  });
});
