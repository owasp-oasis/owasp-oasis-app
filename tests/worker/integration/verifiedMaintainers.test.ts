import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';
import { applySchema, buildCookieHeader, cleanDB, createTestSession, insertTestPR, insertTestRepo, makeCsrf } from './helpers.js';

function post(path: string, session: { sessionCookie: string; tokenCookie: string }, csrf: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { Cookie: buildCookieHeader(session.sessionCookie, session.tokenCookie, `__csrf=${csrf}`), 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify(body),
  });
}

describe('verified upstream maintainer registration', () => {
  beforeAll(async () => applySchema(env));
  beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
  afterEach(async () => { fetchMock.deactivate(); await cleanDB(env); });

  it('requires GitHub Maintain or Admin on the upstream linked to the selected OASIS fork', async () => {
    const repo = await insertTestRepo(env);
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE id = ?").bind(repo.id).run();
    const maintainer = await createTestSession(env, { github_user_id: 711, github_login: 'upstream-maintainer', github_token: 'user-token' });
    const csrf = makeCsrf();
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/upstream/project')
      .respondWith(new Response(JSON.stringify({ id: 9911, full_name: 'upstream/project', permissions: { maintain: true, push: true } }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/user')
      .respondWith(new Response(JSON.stringify({ id: 711, login: 'upstream-maintainer', name: 'Upstream Maintainer' }), { headers: { 'Content-Type': 'application/json' } }));

    const response = await SELF.fetch(post('/api/maintainer/repositories', maintainer, csrf, { oasis_repo_id: repo.id }));
    expect(response.status).toBe(200);
    expect((await response.json()).repository).toMatchObject({ oasis_repo_id: repo.id, upstream_repo_github_id: 9911, github_permission: 'maintain', github_login: 'upstream-maintainer', github_name: 'Upstream Maintainer' });

    const listed = await SELF.fetch(new Request('http://localhost/api/maintainer/repositories', { headers: { Cookie: buildCookieHeader(maintainer.sessionCookie, maintainer.tokenCookie) } }));
    expect((await listed.json()).repositories).toMatchObject([{ github_name: 'Upstream Maintainer' }]);
    const roster = await SELF.fetch(new Request(`http://localhost/api/workspace/repos/${repo.id}/management`));
    expect((await roster.json()).maintainers).toMatchObject([{ github_login: 'upstream-maintainer', github_name: 'Upstream Maintainer' }]);

  });

  it('rejects a GitHub user who has push access without Maintain or Admin', async () => {
    const repo = await insertTestRepo(env);
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE id = ?").bind(repo.id).run();
    const contributor = await createTestSession(env, { github_user_id: 712, github_login: 'ordinary-user' });
    const csrf = makeCsrf();
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/upstream/project')
      .respondWith(new Response(JSON.stringify({ id: 9911, full_name: 'upstream/project', permissions: { push: true, maintain: false, admin: false } }), { headers: { 'Content-Type': 'application/json' } }));
    const denied = await SELF.fetch(post('/api/maintainer/repositories', contributor, csrf, { oasis_repo_id: repo.id }));
    expect(denied.status).toBe(403);
    const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM verified_upstream_maintainers').first<{ count: number }>();
    expect(count?.count).toBe(0);
  });

  it('allows the registered maintainer to decide for that fork and denies another signed-in member', async () => {
    const repo = await insertTestRepo(env);
    await env.DB.prepare("UPDATE repos SET upstream_url = 'https://github.com/upstream/project' WHERE id = ?").bind(repo.id).run();
    await insertTestPR(env, { repo_name: repo.name, repo_id: repo.id });
    await env.DB.prepare("UPDATE pull_requests SET head_sha = 'test-head-sha' WHERE id = 1001").run();
    await env.DB.prepare(`INSERT INTO verified_upstream_maintainers
      (oasis_repo_id, upstream_repo_github_id, upstream_full_name, github_user_id, github_login, github_permission, verified_at, created_at, updated_at)
      VALUES (?, 9911, 'upstream/project', 711, 'upstream-maintainer', 'maintain', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z', '2026-11-11T00:00:00.000Z')`).bind(repo.id).run();
    await env.DB.prepare('UPDATE pull_requests SET participants = 10, consensus_accept = 8 WHERE id = 1001').run();
    const maintainer = await createTestSession(env, { github_user_id: 711, github_login: 'upstream-maintainer' });
    const member = await createTestSession(env, { github_user_id: 712, github_login: 'ordinary-user' });
    const csrf = makeCsrf();
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/upstream/project')
      .respondWith(new Response(JSON.stringify({ id: 9911, full_name: 'upstream/project', permissions: { maintain: true } }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/repos/owasp-oasis/test-repo/pulls/1')
      .respondWith(new Response(JSON.stringify({ state: 'open', head: { sha: 'test-head-sha' } }), { headers: { 'Content-Type': 'application/json' } }));

    const denied = await SELF.fetch(post('/api/pr-panel/1001/maintainer-decision', member, csrf, { decision: 'accepted', reason: 'Ready for upstream review.' }));
    expect(denied.status).toBe(403);
    const accepted = await SELF.fetch(post('/api/pr-panel/1001/maintainer-decision', maintainer, csrf, { decision: 'accepted', reason: 'Ready for upstream review.' }));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).maintainer_decision.github_login).toBe('upstream-maintainer');
  });
});
