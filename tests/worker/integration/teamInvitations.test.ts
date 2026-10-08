import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, createTestSession, makeCsrf } from './helpers.js';

type Session = Awaited<ReturnType<typeof createTestSession>>;
async function mine(session?: Session) {
  return SELF.fetch(new Request('http://localhost/api/teams/mine', { headers: session ? { Cookie: session.sessionCookie } : {} }));
}
async function respond(session: Session | undefined, action: string, inviteId: unknown, teamId = 1, csrf = true) {
  const token = makeCsrf();
  return SELF.fetch(new Request(`http://localhost/api/teams/${teamId}/members`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': token } : {}), Cookie: `__csrf=${token}; ${session?.sessionCookie ?? ''}` },
    body: JSON.stringify({ action, invite_id: inviteId, github_login: 'invitee' }),
  }));
}
async function fixture() {
  const invitee = await createTestSession(env, { github_login: 'invitee' });
  const outsider = await createTestSession(env, { github_login: 'outsider' });
  for (const [id, status] of [[1, 'active'], [2, 'archived'], [3, 'suspended']] as const) {
    await env.DB.prepare('INSERT INTO teams (id, name, owner_login, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, `Test Team ${id}`, 'owner', status, new Date().toISOString(), new Date().toISOString()).run();
  }
  for (const [id, team, login, status] of [[1, 1, 'invitee', 'pending'], [2, 2, 'invitee', 'pending'], [3, 3, 'invitee', 'pending'], [4, 1, 'invitee', 'accepted'], [5, 1, 'invitee', 'declined'], [6, 1, 'invitee', 'revoked'], [7, 1, 'outsider', 'pending']] as const) {
    await env.DB.prepare('INSERT INTO team_invites (id, team_id, invitee_login, invited_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, team, login, 'owner', status, new Date().toISOString()).run();
  }
  return { invitee, outsider };
}

describe('Team invitation notifications and responses', () => {
  beforeAll(async () => applySchema(env));
  afterEach(async () => cleanDB(env));

  it('returns only the signed-in invitee’s pending invitations to active Teams', async () => {
    const { invitee, outsider } = await fixture();
    expect((await mine()).status).toBe(401);
    const response = await mine(invitee);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect((await response.json() as { invites: unknown[] }).invites).toEqual([
      { id: 1, team_id: 1, team_name: 'Test Team 1', created_at: expect.any(String) },
    ]);
    expect((await (await mine(outsider)).json() as { invites: { id: number }[] }).invites.map(i => i.id)).toEqual([7]);
  });

  it('provides a stable, non-authenticating dismissal scope that changes on the next login', async () => {
    const { invitee } = await fixture();
    const first = await (await mine(invitee)).json() as { notification_session: string };
    const repeat = await (await mine(invitee)).json() as { notification_session: string };
    const newSession = await createTestSession(env, { github_login: 'invitee' });
    const next = await (await mine(newSession)).json() as { notification_session: string };
    expect(first.notification_session).toMatch(/^[a-f0-9]{64}$/);
    expect(repeat.notification_session).toBe(first.notification_session);
    expect(next.notification_session).not.toBe(first.notification_session);
    expect(invitee.sessionCookie).not.toContain(first.notification_session);
    expect((await SELF.fetch(new Request('http://localhost/api/teams/mine', { headers: { Cookie: '__session=' + first.notification_session } }))).status).toBe(401);
  });

  it.each(['accept_invite', 'decline_invite'])('protects %s from anonymous, other-account, malformed, and CSRF requests', async action => {
    const { invitee, outsider } = await fixture();
    expect((await respond(undefined, action, 1)).status).toBe(401);
    expect((await respond(invitee, action, 1, 1, false)).status).toBe(403);
    expect((await respond(outsider, action, 1)).status).toBe(404);
    for (const id of [null, -1, 1.5, '1', {}, Number.MAX_SAFE_INTEGER + 1]) expect((await respond(invitee, action, id)).status).toBe(400);
    for (const id of [4, 5, 6, 999]) expect((await respond(invitee, action, id)).status).toBe(404);
    expect((await respond(invitee, action, 1, 2)).status).toBe(409);
    expect((await respond(invitee, action, 1, 999)).status).toBe(404);
    expect((await env.DB.prepare('SELECT status FROM team_invites WHERE id = 1').first<{ status: string }>())?.status).toBe('pending');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM team_memberships').first<{ n: number }>())?.n).toBe(0);
  });

  it('declines without creating membership and excludes the invitation from later reads', async () => {
    const { invitee } = await fixture();
    expect((await respond(invitee, 'decline_invite', 1)).status).toBe(200);
    expect((await (await mine(invitee)).json() as { invites: unknown[] }).invites).toEqual([]);
    expect(await env.DB.prepare('SELECT status, resolved_at FROM team_invites WHERE id = 1').first()).toEqual({ status: 'declined', resolved_at: expect.any(String) });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM team_memberships').first<{ n: number }>())?.n).toBe(0);
    expect((await respond(invitee, 'accept_invite', 1)).status).toBe(404);
  });

  it('accepts once, creates membership, and removes the pending invitation', async () => {
    const { invitee } = await fixture();
    expect((await respond(invitee, 'accept_invite', 1)).status).toBe(200);
    const result = await (await mine(invitee)).json() as { invites: unknown[]; teams: { id: number }[] };
    expect(result.invites).toEqual([]);
    expect(result.teams.map(t => t.id)).toEqual([1]);
    expect((await respond(invitee, 'accept_invite', 1)).status).toBe(404);
    expect((await respond(invitee, 'decline_invite', 1)).status).toBe(404);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM team_memberships').first<{ n: number }>())?.n).toBe(1);
  });

  it('keeps concurrent accept and decline consistent with membership', async () => {
    const { invitee } = await fixture();
    const responses = await Promise.all([respond(invitee, 'accept_invite', 1), respond(invitee, 'decline_invite', 1)]);
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    const invite = await env.DB.prepare('SELECT status FROM team_invites WHERE id = 1').first<{ status: string }>();
    const membership = await env.DB.prepare('SELECT COUNT(*) AS n FROM team_memberships').first<{ n: number }>();
    expect(membership?.n).toBe(invite?.status === 'accepted' ? 1 : 0);
  });
});
