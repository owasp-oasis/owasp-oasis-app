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

function mockLiveCandidatePR(initialSha: string): (sha: string) => void {
  let sha = initialSha;
  fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/owasp-oasis/test-repo/pulls/1')
    .respondWith(() => new Response(JSON.stringify({
      number: 1,
      title: 'Fix SQL injection',
      state: 'open',
      html_url: 'https://github.com/owasp-oasis/test-repo/pull/1',
      body: 'Candidate fix',
      head: { sha, ref: 'fix/sql-injection', repo: { full_name: 'owasp-oasis/test-repo' } },
    }), { headers: { 'Content-Type': 'application/json' } }));
  return current => { sha = current; };
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
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'test-head-sha' WHERE id = 1001").run();
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
    mockLiveCandidatePR('test-head-sha');
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
    const setLiveSha = mockLiveCandidatePR('before-revision');
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
    setLiveSha('after-revision');
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
    expect(audit?.count).toBe(4);
  });

  it('rejects a decision when GitHub has a newer revision than the synchronized candidate', async () => {
    await insertTestPR(env);
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'stale-db-sha' WHERE id = 1001").run();
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    mockLiveCandidatePR('current-github-sha');
    const response = await SELF.fetch(requestWithSession('/api/pr-panel/1001/maintainer-decision', admin, makeCsrf(), {
      decision: 'accepted', reason: 'Reviewed current revision.',
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/changed on GitHub/);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM maintainer_decisions WHERE pr_id = 1001').first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('creates a distinct cross-fork upstream PR only after maintainer acceptance', async () => {
    await insertTestRepo(env, { name: 'test-repo' });
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE name = 'test-repo'").run();
    await insertTestPR(env);
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'abc123456789' WHERE id = 1001").run();
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    mockLiveCandidatePR('abc123456789');
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

  it('blocks upstream submission when the candidate head changed after approval', async () => {
    await insertTestRepo(env, { name: 'test-repo' });
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE name = 'test-repo'").run();
    await insertTestPR(env);
    const admin = await createTestSession(env, { github_user_id: 7505051, github_login: 'humor4fun' });
    const csrf = makeCsrf();
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'approved-sha' WHERE id = 1001").run();
    const setLiveSha = mockLiveCandidatePR('approved-sha');
    const accepted = await SELF.fetch(requestWithSession('/api/pr-panel/1001/maintainer-decision', admin, csrf, {
      decision: 'accepted', reason: 'Reviewed current revision.',
    }));
    expect(accepted.status).toBe(200);
    setLiveSha('new-unreviewed-sha');
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/upstream/project')
      .respondWith(new Response(JSON.stringify({ full_name: 'upstream/project', default_branch: 'main' }), { headers: { 'Content-Type': 'application/json' } }));

    const submit = await SELF.fetch(requestWithSession('/api/pr-panel/1001/submit-upstream', admin, csrf, { confirm: true }));
    expect(submit.status).toBe(409);
    expect((await submit.json()).error).toMatch(/changed after approval/);
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM upstream_submissions').first<{ count: number }>()).toMatchObject({ count: 0 });
  });

  it('returns only current-revision validator identities and credibility to a verified maintainer', async () => {
    await insertTestRepo(env, { name: 'test-repo' });
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE name = 'test-repo'").run();
    await insertTestPR(env);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'current-sha' WHERE id = 1001").run();
    await env.DB.prepare(`INSERT INTO verified_upstream_maintainers
      (oasis_repo_id, upstream_repo_github_id, upstream_full_name, github_user_id, github_login, github_permission, verified_at, created_at, updated_at)
      SELECT id, 500, 'upstream/project', 811, 'maintainer', 'maintain', ?, ?, ? FROM repos WHERE name = 'test-repo'`)
      .bind(now, now, now).run();
    await env.DB.prepare(`INSERT INTO contributors (login, modified_reputation, prs_worked, rank_90d, synced_at)
      VALUES ('validator-now', 28.4, 6, 9, ?), ('validator-old', 33.2, 8, 4, ?)`)
      .bind(now, now).run();
    await env.DB.prepare(`INSERT INTO user_votes (github_login, github_user_id, pr_id, repo_name, pr_number, decision, head_sha, voted_at)
      VALUES ('validator-now', 9001, 1001, 'test-repo', 1, 'accept', 'current-sha', ?),
             ('validator-old', 9002, 1001, 'test-repo', 1, 'reject', 'old-sha', ?),
             ('legacy-validator', NULL, 1001, 'test-repo', 1, 'modify', NULL, ?)`)
      .bind(now, now, now).run();

    const member = await createTestSession(env, { github_user_id: 812, github_login: 'ordinary-member' });
    const denied = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/validation-evidence', {
      headers: { Cookie: buildCookieHeader(member.sessionCookie, member.tokenCookie) },
    }));
    expect(denied.status).toBe(403);

    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/upstream/project')
      .respondWith(new Response(JSON.stringify({ id: 500, full_name: 'upstream/project', permissions: { maintain: true } }), { headers: { 'Content-Type': 'application/json' } }));
    const maintainer = await createTestSession(env, { github_user_id: 811, github_login: 'maintainer' });
    const response = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/validation-evidence', {
      headers: { Cookie: buildCookieHeader(maintainer.sessionCookie, maintainer.tokenCookie) },
    }));
    expect(response.status).toBe(200);
    const evidence = await response.json();
    expect(evidence.counts).toEqual({ accept: 1, modify: 0, reject: 0 });
    expect(evidence.participants).toHaveLength(1);
    expect(evidence.participants[0]).toMatchObject({
      github_login: 'validator-now', decision: 'accept', reputation: 28.4, prs_worked: 6, rank_90d: 9,
    });
    expect(evidence.historical_votes_unattributed).toBe(true);
    expect(evidence.historical_vote_count).toBe(1);
  });

  it('recovers a pending submission after a lost GitHub create response without creating a duplicate', async () => {
    await insertTestRepo(env, { name: 'test-repo' });
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE name = 'test-repo'").run();
    await insertTestPR(env);
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'validated-sha' WHERE id = 1001").run();
    await env.DB.prepare(`
      INSERT INTO maintainer_decisions (id, pr_id, decision, reason, head_sha, github_user_id, github_login, created_at)
      VALUES ('accepted-1', 1001, 'accepted', 'Reviewed this revision.', 'validated-sha', 7505051, 'humor4fun', ?)
    `).bind(now).run();
    await env.DB.prepare(`
      INSERT INTO upstream_submissions (
        id, source_pr_id, upstream_full_name, upstream_default_branch,
        head_repo_full_name, head_branch, validated_head_sha, base_branch,
        status, submitted_by_github_id, submitted_by_login, created_at, updated_at
      ) VALUES ('pending-1', 1001, 'upstream/project', 'main', 'owasp-oasis/test-repo',
        'fix/sql-injection', 'validated-sha', 'main', 'pending', 7505051, 'humor4fun', ?, ?)
    `).bind(now, now).run();

    fetchMock.when(req => req.method === 'GET' && req.url.includes('/repos/upstream/project/pulls?'))
      .respondWith(new Response(JSON.stringify([{
        id: 9002,
        number: 43,
        node_id: 'PR_kwDO43',
        html_url: 'https://github.com/upstream/project/pull/43',
        state: 'open',
        body: 'Submitted from OASIS candidate PR https://github.com/owasp-oasis/test-repo/pull/1',
        head: { sha: 'validated-sha', ref: 'fix/sql-injection', repo: { full_name: 'owasp-oasis/test-repo' } },
        base: { ref: 'main' },
      }]), { headers: { 'Content-Type': 'application/json' } }));

    const recovered = await SELF.fetch(new Request('http://localhost/api/pr-panel/1001/workflow'));
    const body = await recovered.json();
    expect(body.upstream_submission).toMatchObject({
      status: 'open',
      upstream_pr_number: 43,
      upstream_pr_url: 'https://github.com/upstream/project/pull/43',
      validated_head_sha: 'validated-sha',
    });
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM upstream_submissions WHERE source_pr_id = 1001').first<{ count: number }>())
      .toMatchObject({ count: 1 });
  });

  it('communicates upstream review requests and merge outcomes on refresh', async () => {
    await insertTestPR(env);
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'abc123456789' WHERE id = 1001").run();
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
