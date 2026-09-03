import { env } from 'cloudflare:test';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fetchMock } from './fetchMock.js';
import {
  applySchema,
  buildCookieHeader,
  cleanDB,
  createTestSession,
  insertTestRegistration,
  makeCsrf,
} from './helpers.js';
import { SELF } from './testWorker.js';

interface SessionCookies {
  sessionCookie: string;
  tokenCookie: string;
}

function adminRequest(
  path: string,
  session?: SessionCookies,
  options?: { method?: string; csrf?: string; body?: unknown },
): Request {
  const headers = new Headers();
  if (session) {
    headers.set('Cookie', buildCookieHeader(
      session.sessionCookie,
      session.tokenCookie,
      ...(options?.csrf ? [`__csrf=${options.csrf}`] : []),
    ));
  }
  if (options?.csrf) headers.set('x-csrf-token', options.csrf);
  if (options?.body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`http://localhost${path}`, {
    method: options?.method ?? 'GET',
    headers,
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function registrationId(email: string): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT id FROM registrations WHERE email = ?',
  ).bind(email).first<{ id: number }>();
  if (!row) throw new Error('Test registration was not inserted');
  return row.id;
}

describe('administrator user role management', () => {
  beforeAll(async () => applySchema(env));

  beforeEach(() => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  afterEach(async () => {
    fetchMock.deactivate();
    await cleanDB(env);
  });

  it('allows only an authenticated administrator to list registrations', async () => {
    const guest = await SELF.fetch(adminRequest('/api/admin/users'));
    expect(guest.status).toBe(401);

    const member = await createTestSession(env, {
      github_user_id: 101,
      github_login: 'ordinary-member',
    });
    const forbidden = await SELF.fetch(adminRequest('/api/admin/users', member));
    expect(forbidden.status).toBe(403);

    await insertTestRegistration(env, {
      email: 'alex@example.org',
      github: 'alex-user',
      role: 'validator',
    });
    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const allowed = await SELF.fetch(adminRequest('/api/admin/users?q=alex', admin));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('Cache-Control')).toBe('no-store');
    const body = await allowed.json() as {
      users: Array<Record<string, unknown>>;
      pagination: { total: number };
    };
    expect(body.pagination.total).toBe(1);
    expect(body.users).toEqual([
      expect.objectContaining({
        email: 'alex@example.org',
        github: 'alex-user',
        registration_role: 'validator',
        access_role: 'member',
        can_assign_role: true,
      }),
    ]);
    expect(body.users[0]).not.toHaveProperty('ip_hash');
  });

  it('requires both admin authorization and a valid CSRF token to assign a role', async () => {
    await insertTestRegistration(env, { email: 'target@example.org', github: 'target-user' });
    const id = await registrationId('target@example.org');
    const member = await createTestSession(env, {
      github_user_id: 102,
      github_login: 'ordinary-member',
    });
    const memberCsrf = makeCsrf();
    const forbidden = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, member, {
      method: 'POST', csrf: memberCsrf, body: { role: 'moderator' },
    }));
    expect(forbidden.status).toBe(403);

    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const invalidCsrf = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, admin, {
      method: 'POST', body: { role: 'moderator' },
    }));
    expect(invalidCsrf.status).toBe(403);
  });

  it('verifies GitHub identity, assigns the role by immutable ID, and audits it atomically', async () => {
    await insertTestRegistration(env, { email: 'target@example.org', github: 'old-casing' });
    const id = await registrationId('target@example.org');
    fetchMock.when(request => request.url === 'https://api.github.com/users/old-casing')
      .respondWith(Response.json({ id: 4242, login: 'Canonical-User', type: 'User' }));

    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const csrf = makeCsrf();
    const response = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, admin, {
      method: 'POST', csrf, body: { role: 'moderator' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      user: {
        registration_id: id,
        github: 'Canonical-User',
        github_user_id: 4242,
        access_role: 'moderator',
      },
    }));
    const role = await env.DB.prepare(`
      SELECT github_user_id, github_login, role, assigned_by_github_user_id
      FROM user_roles WHERE github_user_id = 4242
    `).first();
    expect(role).toEqual({
      github_user_id: 4242,
      github_login: 'Canonical-User',
      role: 'moderator',
      assigned_by_github_user_id: 7505051,
    });
    const registration = await env.DB.prepare(
      'SELECT github FROM registrations WHERE id = ?',
    ).bind(id).first();
    expect(registration).toEqual({ github: 'Canonical-User' });
    const audit = await env.DB.prepare(`
      SELECT github_user_id, github_login, role, action, target_type, target_id, outcome
      FROM privileged_action_audit WHERE action = 'user_role.assign'
    `).first();
    expect(audit).toEqual({
      github_user_id: 7505051,
      github_login: 'humor4fun',
      role: 'admin',
      action: 'user_role.assign',
      target_type: 'github_user',
      target_id: '4242',
      outcome: 'succeeded',
    });

    const rebind = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, admin, {
      method: 'POST', csrf, body: { role: 'guest', github: 'different-user' },
    }));
    expect(rebind.status).toBe(409);
    const retainedRole = await env.DB.prepare(
      'SELECT role FROM user_roles WHERE github_user_id = 4242',
    ).first<{ role: string }>();
    expect(retainedRole?.role).toBe('moderator');
  });

  it('lets an administrator supply a missing GitHub identity while assigning a role', async () => {
    await insertTestRegistration(env, { email: 'legacy@example.org', github: '' });
    const id = await registrationId('legacy@example.org');
    fetchMock.when(request => request.url === 'https://api.github.com/users/legacy-user')
      .respondWith(Response.json({ id: 5150, login: 'Legacy-User', type: 'User' }));

    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const list = await SELF.fetch(adminRequest('/api/admin/users?q=legacy', admin));
    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual(expect.objectContaining({
      users: [expect.objectContaining({
        github: '',
        access_role: null,
        is_self: false,
        can_assign_role: true,
      })],
    }));

    const response = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, admin, {
      method: 'POST',
      csrf: makeCsrf(),
      body: { role: 'moderator', github: '@legacy-user' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      user: {
        registration_id: id,
        github: 'Legacy-User',
        github_user_id: 5150,
        access_role: 'moderator',
      },
    }));
    const registration = await env.DB.prepare(
      'SELECT github FROM registrations WHERE id = ?',
    ).bind(id).first();
    expect(registration).toEqual({ github: 'Legacy-User' });
  });

  it('refuses missing or invalid GitHub identities without changing roles', async () => {
    await insertTestRegistration(env, { email: 'missing@example.org', github: '' });
    await insertTestRegistration(env, { email: 'gone@example.org', github: 'deleted-user' });
    const missingId = await registrationId('missing@example.org');
    const goneId = await registrationId('gone@example.org');
    fetchMock.when(request => request.url === 'https://api.github.com/users/deleted-user')
      .respondWith(Response.json({ message: 'Not Found' }, { status: 404 }));

    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const csrf = makeCsrf();
    const missing = await SELF.fetch(adminRequest(`/api/admin/users/${missingId}/role`, admin, {
      method: 'POST', csrf, body: { role: 'moderator' },
    }));
    expect(missing.status).toBe(409);

    const gone = await SELF.fetch(adminRequest(`/api/admin/users/${goneId}/role`, admin, {
      method: 'POST', csrf, body: { role: 'moderator' },
    }));
    expect(gone.status).toBe(400);

    const changedRoles = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM user_roles WHERE github_user_id != 7505051',
    ).first<{ count: number }>();
    expect(changedRoles?.count).toBe(0);
    const audits = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM privileged_action_audit WHERE action = 'user_role.assign'",
    ).first<{ count: number }>();
    expect(audits?.count).toBe(0);
  });

  it('prevents an administrator from changing their own role', async () => {
    await insertTestRegistration(env, { email: 'admin@example.org', github: 'humor4fun' });
    const id = await registrationId('admin@example.org');
    fetchMock.when(request => request.url === 'https://api.github.com/users/humor4fun')
      .respondWith(Response.json({ id: 7505051, login: 'humor4fun', type: 'User' }));
    const admin = await createTestSession(env, {
      github_user_id: 7505051,
      github_login: 'humor4fun',
    });
    const csrf = makeCsrf();
    const response = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, admin, {
      method: 'POST', csrf, body: { role: 'guest' },
    }));
    expect(response.status).toBe(409);
    const role = await env.DB.prepare(
      'SELECT role FROM user_roles WHERE github_user_id = 7505051',
    ).first<{ role: string }>();
    expect(role?.role).toBe('admin');

    const overrideAttempt = await SELF.fetch(adminRequest(`/api/admin/users/${id}/role`, admin, {
      method: 'POST', csrf, body: { role: 'guest', github: 'different-user' },
    }));
    expect(overrideAttempt.status).toBe(409);
  });
});
