import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { SELF } from './testWorker.js';
import { applySchema, cleanDB, createTestSession, insertTestPR, insertTestRepo, makeCsrf } from './helpers.js';

function cookies(csrf: string, sessionCookie: string, tokenCookie: string): HeadersInit {
  return {
    'content-type': 'application/json',
    'x-csrf-token': csrf,
    Cookie: `__csrf=${csrf}; ${sessionCookie}; ${tokenCookie}`,
  };
}

async function post(path: string, body: Record<string, unknown>, csrf: string, sessionCookie: string, tokenCookie: string) {
  return SELF.fetch(new Request(`http://localhost${path}`, {
    method: 'POST', headers: cookies(csrf, sessionCookie, tokenCookie), body: JSON.stringify(body),
  }));
}

describe('Community Teams', () => {
  beforeAll(async () => applySchema(env));
  afterEach(async () => cleanDB(env));

  it('creates a Team with its creator as owner and keeps member data private', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const csrf = makeCsrf();
    const create = await post('/api/teams', { name: 'Python reviewers', description: 'Review Python fixes.' }, csrf, owner.sessionCookie, owner.tokenCookie);
    expect(create.status).toBe(200);
    const created = await create.json() as { team: { id: number; name: string } };
    expect(created.team.name).toBe('Python reviewers');

    const publicDetail = await SELF.fetch(new Request(`http://localhost/api/teams/${created.team.id}`));
    const publicBody = await publicDetail.json() as Record<string, unknown>;
    expect(publicBody.members).toBeUndefined();
    expect((publicBody.team as { member_count: number }).member_count).toBe(1);

    const privateDetail = await SELF.fetch(new Request(`http://localhost/api/teams/${created.team.id}`, {
      headers: { Cookie: `${owner.sessionCookie}; ${owner.tokenCookie}` },
    }));
    const privateBody = await privateDetail.json() as { membership: string; members: Array<{ github_login: string; role: string }> };
    expect(privateBody.membership).toBe('owner');
    expect(privateBody.members).toEqual([{ github_login: 'owner', role: 'owner', joined_at: expect.any(String) }]);
  });

  it('requires an accepted invitation before a member can see private activity', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const member = await createTestSession(env, { github_login: 'member' });
    const createCsrf = makeCsrf();
    const created = await post('/api/teams', { name: 'Invite-only', description: '' }, createCsrf, owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;

    const invite = await post(`/api/teams/${teamId}/members`, { action: 'invite', github_login: 'member' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(invite.status).toBe(200);
    const mine = await SELF.fetch(new Request('http://localhost/api/teams/mine', { headers: { Cookie: `${member.sessionCookie}; ${member.tokenCookie}` } }));
    const mineBody = await mine.json() as { invites: Array<{ id: number }> };
    expect(mineBody.invites).toHaveLength(1);

    const accept = await post(`/api/teams/${teamId}/members`, { action: 'accept_invite', invite_id: mineBody.invites[0].id }, makeCsrf(), member.sessionCookie, member.tokenCookie);
    expect(accept.status).toBe(200);
    const detail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, { headers: { Cookie: `${member.sessionCookie}; ${member.tokenCookie}` } }));
    expect((await detail.json() as { members: unknown[] }).members).toHaveLength(2);
  });

  it('allows an active member to attribute a submitted validation to one Team', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const csrf = makeCsrf();
    const created = await post('/api/teams', { name: 'Attributed', description: '' }, csrf, owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    await insertTestRepo(env, { id: 7, name: 'attributed-repo' });
    await insertTestPR(env, { id: 71, repo_id: 7, repo_name: 'attributed-repo' });

    // Directly model the already-submitted validation; vote submission validates
    // this same single-Team field before it writes the immutable record.
    await env.DB.prepare(`INSERT INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, team_id, voted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind('owner', 71, 'attributed-repo', 1, 'accept', teamId, new Date().toISOString()).run();

    const leaderboard = await SELF.fetch(new Request('http://localhost/api/teams/leaderboard?period=all_time'));
    const body = await leaderboard.json() as { teams: Array<{ id: number; attributed_validations: number }> };
    expect(body.teams.find(team => team.id === teamId)?.attributed_validations).toBe(1);
  });

  it('only allows a Team manager to set a repository focus', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const outsider = await createTestSession(env, { github_login: 'outsider' });
    const created = await post('/api/teams', { name: 'Repository focus', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    await insertTestRepo(env, { id: 17, name: 'focus-repo' });

    const rejected = await post(`/api/teams/${teamId}/repositories`, { action: 'add', repo_id: 17 }, makeCsrf(), outsider.sessionCookie, outsider.tokenCookie);
    expect(rejected.status).toBe(403);
    const added = await post(`/api/teams/${teamId}/repositories`, { action: 'add', repo_id: 17 }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(added.status).toBe(200);
  });
});
