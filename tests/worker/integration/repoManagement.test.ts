import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { fetchMock } from './fetchMock.js';
import { SELF } from './testWorker.js';
import { applySchema, buildCookieHeader, cleanDB, createTestSession, insertTestRepo, makeCsrf } from './helpers.js';

function request(path: string, method: string, session?: { sessionCookie: string; tokenCookie: string }, csrf?: string, body?: unknown) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (session) headers.set('Cookie', buildCookieHeader(session.sessionCookie, session.tokenCookie, ...(csrf ? [`__csrf=${csrf}`] : [])));
  if (csrf) headers.set('x-csrf-token', csrf);
  return new Request(`http://localhost${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

async function makeAdmin(login = 'oasis-admin', id = 800) {
  const admin = await createTestSession(env, { github_user_id: id, github_login: login });
  await env.DB.prepare(`INSERT INTO user_roles (github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at)
    VALUES (?, ?, 'admin', ?, '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z')`).bind(id, login, id).run();
  return admin;
}

describe('repo stewardship and Repo Role management', () => {
  beforeAll(async () => applySchema(env));
  beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect(); });
  afterEach(async () => { fetchMock.deactivate(); await cleanDB(env); });

  it('requires authentication and CSRF to request stewardship, then lets an OASIS admin appoint one person', async () => {
    const repo = await insertTestRepo(env);
    const applicant = await createTestSession(env, { github_user_id: 711, github_login: 'steward-candidate' });
    const admin = await makeAdmin();
    const url = `/api/workspace/repos/${repo.id}/management`;
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/steward-candidate')
      .respondWith(new Response(JSON.stringify({ id: 711, login: 'steward-candidate', name: 'Steward Candidate' }), { headers: { 'Content-Type': 'application/json' } }));

    expect((await SELF.fetch(request(url, 'POST'))).status).toBe(401);
    expect((await SELF.fetch(request(url, 'POST', applicant))).status).toBe(403);

    const csrf = makeCsrf();
    const submitted = await SELF.fetch(request(url, 'POST', applicant, csrf));
    expect(submitted.status).toBe(200);
    const requestId = (await submitted.json()).request.id as string;
    expect((await SELF.fetch(request(`/api/workspace/repos/${repo.id}/stewardship-requests/${requestId}`, 'POST', applicant, csrf, { decision: 'approve' }))).status).toBe(403);

    const approved = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/stewardship-requests/${requestId}`, 'POST', admin, makeCsrf(), { decision: 'approve' }));
    expect(approved.status).toBe(200);
    expect((await approved.json()).steward).toMatchObject({ github_user_id: 711, github_login: 'steward-candidate' });
    const state = await SELF.fetch(request(url, 'GET', applicant));
    expect((await state.json()).viewer.is_steward).toBe(true);
    expect((await SELF.fetch(request(url, 'POST', applicant, makeCsrf()))).status).toBe(409);
  });

  it('lets only the assigned steward add, modify, and remove verified Repo Roles', async () => {
    const repo = await insertTestRepo(env);
    const steward = await createTestSession(env, { github_user_id: 711, github_login: 'repo-steward' });
    const other = await createTestSession(env, { github_user_id: 712, github_login: 'other-member' });
    await env.DB.prepare(`INSERT INTO repository_stewards
      (oasis_repo_id, github_user_id, github_login, assigned_by_github_user_id, assigned_by_login, assigned_at)
      VALUES (?, 711, 'repo-steward', 800, 'oasis-admin', '2026-11-11T00:00:00Z')`).bind(repo.id).run();
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/octocat')
      .respondWith(new Response(JSON.stringify({ id: 583231, login: 'octocat', name: 'The Octocat' }), { headers: { 'Content-Type': 'application/json' } }));

    const path = `/api/workspace/repos/${repo.id}/roles`;
    expect((await SELF.fetch(request(path, 'POST', other, makeCsrf(), { login: 'octocat', role_name: 'Fix Editor' }))).status).toBe(403);
    for (const role_name of ['Repo Member', 'OASIS Repo Member', 'OASIS Repo Security Steward', 'Upstream Maintainer']) {
      expect((await SELF.fetch(request(path, 'POST', steward, makeCsrf(), { login: 'octocat', role_name }))).status).toBe(400);
    }
    const added = await SELF.fetch(request(path, 'POST', steward, makeCsrf(), { login: 'octocat', role_name: 'Fix Editor', role_description: 'Reviews generated patches' }));
    expect(added.status).toBe(200);
    expect(await added.json()).toMatchObject({ github_user_id: 583231, github_login: 'octocat', role_name: 'Fix Editor' });
    const roster = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/management`, 'GET'));
    const assignmentId = (await roster.json()).role_assignments[0].id as string;

    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/octocat')
      .respondWith(new Response(JSON.stringify({ id: 583231, login: 'octocat', name: 'The Octocat' }), { headers: { 'Content-Type': 'application/json' } }));
    const updated = await SELF.fetch(request(`${path}/${assignmentId}`, 'POST', steward, makeCsrf(), { login: 'octocat', role_name: 'Security Reviewer' }));
    expect(updated.status).toBe(200);
    expect((await updated.json()).role_name).toBe('Security Reviewer');
    const removed = await SELF.fetch(request(`${path}/${assignmentId}`, 'POST', steward, makeCsrf(), { action: 'remove' }));
    expect(removed.status).toBe(200);
    const removedRecord = await env.DB.prepare('SELECT removed_at, removed_by_github_user_id FROM repository_role_assignments WHERE id = ?').bind(assignmentId).first<{ removed_at: string | null; removed_by_github_user_id: number | null }>();
    expect(removedRecord?.removed_at).not.toBeNull();
    expect(removedRecord?.removed_by_github_user_id).toBe(711);
  });

  it('rejects competing pending requests and records the admin decision in the audit log', async () => {
    const repo = await insertTestRepo(env);
    const first = await createTestSession(env, { github_user_id: 711, github_login: 'first-person' });
    const second = await createTestSession(env, { github_user_id: 712, github_login: 'second-person' });
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/first-person')
      .respondWith(new Response(JSON.stringify({ id: 711, login: 'first-person', name: 'First Person' }), { headers: { 'Content-Type': 'application/json' } }));
    fetchMock.when(req => req.method === 'GET' && req.url === 'https://api.github.com/users/second-person')
      .respondWith(new Response(JSON.stringify({ id: 712, login: 'second-person', name: 'Second Person' }), { headers: { 'Content-Type': 'application/json' } }));
    const firstRequest = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/management`, 'POST', first, makeCsrf()));
    expect(firstRequest.status).toBe(200);
    expect((await SELF.fetch(request(`/api/workspace/repos/${repo.id}/management`, 'POST', second, makeCsrf()))).status).toBe(409);
    const requestId = (await firstRequest.json()).request.id as string;
    const admin = await makeAdmin();
    const denied = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/stewardship-requests/${requestId}`, 'POST', admin, makeCsrf(), { decision: 'decline' }));
    expect(denied.status).toBe(200);
    const audit = await env.DB.prepare("SELECT action, outcome FROM privileged_action_audit WHERE action = 'repo_stewardship.decline'").first<{ action: string; outcome: string }>();
    expect(audit).toEqual({ action: 'repo_stewardship.decline', outcome: 'succeeded' });
  });

  it('shows OASIS admins pending requests and each requestor only their own status', async () => {
    const firstRepo = await insertTestRepo(env);
    const applicant = await createTestSession(env, { github_user_id: 711, github_login: 'first-person' });
    const other = await createTestSession(env, { github_user_id: 712, github_login: 'other-person' });
    const admin = await makeAdmin();
    await env.DB.prepare(`INSERT INTO repository_stewardship_requests
      (id, oasis_repo_id, requester_github_user_id, requester_login, requester_name, status, requested_at)
      VALUES ('pending-req', ?, 711, 'first-person', 'First Person', 'pending', '2026-11-11T00:00:00Z'),
             ('declined-req', ?, 712, 'other-person', 'Other Person', 'declined', '2026-11-10T00:00:00Z')`)
      .bind(firstRepo.id, firstRepo.id).run();

    const adminResponse = await SELF.fetch(request('/api/workspace/stewardship-requests', 'GET', admin));
    expect(adminResponse.status).toBe(200);
    expect(await adminResponse.json()).toMatchObject({
      is_admin: true,
      pending: [{ id: 'pending-req', repo_full_name: 'owasp-oasis/test-repo', requester_login: 'first-person' }],
      mine: [],
    });
    const applicantResponse = await SELF.fetch(request('/api/workspace/stewardship-requests', 'GET', applicant));
    expect(await applicantResponse.json()).toMatchObject({
      is_admin: false,
      pending: [],
      mine: [{ id: 'pending-req', status: 'pending', repo_full_name: 'owasp-oasis/test-repo' }],
    });
    const otherResponse = await SELF.fetch(request('/api/workspace/stewardship-requests', 'GET', other));
    expect(await otherResponse.json()).toMatchObject({
      is_admin: false,
      pending: [],
      mine: [{ id: 'declined-req', status: 'declined', repo_full_name: 'owasp-oasis/test-repo' }],
    });
    expect((await SELF.fetch(request('/api/workspace/stewardship-requests', 'GET'))).status).toBe(401);
  });

  it('starts the retry cooldown when a request is declined, not when it was submitted', async () => {
    const repo = await insertTestRepo(env);
    const applicant = await createTestSession(env, { github_user_id: 711, github_login: 'first-person' });
    const oldRequestedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare(`INSERT INTO repository_stewardship_requests
      (id, oasis_repo_id, requester_github_user_id, requester_login, status, requested_at, reviewed_at)
      VALUES ('recently-declined', ?, 711, 'first-person', 'declined', ?, ?)`)
      .bind(repo.id, oldRequestedAt, new Date().toISOString()).run();
    const response = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/management`, 'POST', applicant, makeCsrf()));
    expect(response.status).toBe(429);
  });

  it('allows the Steward to remove an upstream maintainer from OASIS without changing GitHub access', async () => {
    const repo = await insertTestRepo(env);
    const steward = await createTestSession(env, { github_user_id: 711, github_login: 'repo-steward' });
    await env.DB.prepare(`INSERT INTO repository_stewards
      (oasis_repo_id, github_user_id, github_login, assigned_by_github_user_id, assigned_by_login, assigned_at)
      VALUES (?, 711, 'repo-steward', 800, 'oasis-admin', '2026-11-11T00:00:00Z')`).bind(repo.id).run();
    await env.DB.prepare(`INSERT INTO verified_upstream_maintainers
      (oasis_repo_id, upstream_repo_github_id, upstream_full_name, github_user_id, github_login, github_permission, verified_at, created_at, updated_at)
      VALUES (?, 9911, 'upstream/project', 712, 'upstream-maintainer', 'maintain', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z')`).bind(repo.id).run();

    const response = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/maintainers/712`, 'POST', steward, makeCsrf(), { action: 'remove' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ removed: true, github_access_changed: false });
    const registration = await env.DB.prepare('SELECT removed_at FROM verified_upstream_maintainers WHERE oasis_repo_id = ? AND github_user_id = 712')
      .bind(repo.id).first<{ removed_at: string | null }>();
    expect(registration?.removed_at).not.toBeNull();
  });

  it('lets the appointed Steward resign and keeps role assignments as history', async () => {
    const repo = await insertTestRepo(env);
    const steward = await createTestSession(env, { github_user_id: 711, github_login: 'repo-steward' });
    await env.DB.prepare(`INSERT INTO repository_stewards
      (oasis_repo_id, github_user_id, github_login, assigned_by_github_user_id, assigned_by_login, assigned_at)
      VALUES (?, 711, 'repo-steward', 800, 'oasis-admin', '2026-11-11T00:00:00Z')`).bind(repo.id).run();
    await env.DB.prepare(`INSERT INTO repository_role_assignments
      (id, oasis_repo_id, github_user_id, github_login, role_name, role_description, assigned_by_github_user_id, assigned_by_login, created_at, updated_at)
      VALUES ('role-history', ?, 712, 'octocat', 'Fix Editor', '', 711, 'repo-steward', '2026-11-11T00:00:00Z', '2026-11-11T00:00:00Z')`).bind(repo.id).run();
    const response = await SELF.fetch(request(`/api/workspace/repos/${repo.id}/steward`, 'POST', steward, makeCsrf(), { action: 'resign' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ended: true, repo_roles_retained: true });
    const role = await env.DB.prepare('SELECT id FROM repository_role_assignments WHERE id = ?').bind('role-history').first();
    expect(role).not.toBeNull();
  });
});
