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

  it('searches invitation candidates by handle without exposing private fields or existing members/invites', async () => {
    const owner = await createTestSession(env, { github_login: 'search-owner' });
    const create = await post('/api/teams', { name: 'Member search' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = (await create.json() as { team: { id: number } }).team.id;
    for (const login of ['search-alice', 'search-bob']) await createTestSession(env, { github_login: login });
    await createTestSession(env, { github_login: 'search-alice' }); // Multiple sessions must not duplicate people.
    await post(`/api/teams/${teamId}/members`, { action: 'invite', github_login: 'search-bob' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const response = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}/member-options?q=%40SEARCH`, { headers: { Cookie: owner.sessionCookie } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, members: [{ login: 'search-alice' }] });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('restricts member search to active Team managers', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const member = await createTestSession(env, { github_login: 'member' });
    const outsider = await createTestSession(env, { github_login: 'outsider' });
    const create = await post('/api/teams', { name: 'Private search' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = (await create.json() as { team: { id: number } }).team.id;
    await env.DB.prepare("INSERT INTO team_memberships (team_id, github_login, role, joined_at) VALUES (?, 'member', 'member', ?)").bind(teamId, new Date().toISOString()).run();
    const url = `http://localhost/api/teams/${teamId}/member-options?q=me`;
    expect((await SELF.fetch(new Request(url))).status).toBe(401);
    for (const session of [member, outsider]) expect((await SELF.fetch(new Request(url, { headers: { Cookie: session.sessionCookie } }))).status).toBe(403);
    await env.DB.prepare("UPDATE team_memberships SET role = 'admin' WHERE team_id = ? AND github_login = 'member'").bind(teamId).run();
    expect((await SELF.fetch(new Request(url, { headers: { Cookie: member.sessionCookie } }))).status).toBe(200);
    await env.DB.prepare("UPDATE teams SET status = 'archived' WHERE id = ?").bind(teamId).run();
    expect((await SELF.fetch(new Request(url, { headers: { Cookie: owner.sessionCookie } }))).status).toBe(409);
  });

  it('bounds member search and treats wildcards as invalid input', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const create = await post('/api/teams', { name: 'Bounded search' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = (await create.json() as { team: { id: number } }).team.id;
    const search = (query: string) => SELF.fetch(new Request(`http://localhost/api/teams/${teamId}/member-options?q=${encodeURIComponent(query)}`, { headers: { Cookie: owner.sessionCookie } }));
    expect(await (await search('')).json()).toEqual({ ok: true, members: [] });
    expect(await (await search('a')).json()).toEqual({ ok: true, members: [] });
    for (const query of ['%%', 'a_b', 'x'.repeat(40)]) expect((await search(query)).status).toBe(400);
    for (let i = 0; i < 10; i++) await createTestSession(env, { github_login: 'candidate-' + i });
    expect((await (await search('candidate')).json() as { members: unknown[] }).members).toHaveLength(8);
  });

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
    expect((privateBody as unknown as { badges: Array<{ badge_key: string }> }).badges).toEqual([
      expect.objectContaining({ badge_key: 'membership' }),
    ]);
  });

  it('lets a Team manager choose a bounded contribution badge bar', async () => {
    const owner = await createTestSession(env, { github_login: 'badge-owner' });
    const created = await post('/api/teams', { name: 'Badge threshold', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;

    const invalid = await post(`/api/teams/${teamId}/settings`, { action: 'update', name: 'Badge threshold', description: '', contribution_threshold: 4 }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(invalid.status).toBe(400);
    const updated = await post(`/api/teams/${teamId}/settings`, { action: 'update', name: 'Badge threshold', description: '', contribution_threshold: 3 }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(updated.status).toBe(200);

    const detail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, {
      headers: { Cookie: `${owner.sessionCookie}; ${owner.tokenCookie}` },
    }));
    expect((await detail.json() as { badge_settings: { contribution_threshold: number } }).badge_settings.contribution_threshold).toBe(3);
  });

  it('awards a contribution badge from qualifying Team-attributed work', async () => {
    const owner = await createTestSession(env, { github_login: 'badge-contributor' });
    const created = await post('/api/teams', { name: 'Contribution badges', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    await post(`/api/teams/${teamId}/settings`, { action: 'update', name: 'Contribution badges', description: '', contribution_threshold: 3 }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    await insertTestRepo(env, { id: 90, name: 'badge-repo' });
    for (const id of [901, 902, 903]) {
      await insertTestPR(env, { id, repo_id: 90, repo_name: 'badge-repo', number: id - 900 });
      await env.DB.prepare(`INSERT INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, team_id, voted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind('badge-contributor', id, 'badge-repo', id - 900, 'accept', teamId, new Date().toISOString()).run();
    }

    const detail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, {
      headers: { Cookie: `${owner.sessionCookie}; ${owner.tokenCookie}` },
    }));
    const badges = (await detail.json() as { badges: Array<{ badge_key: string; threshold: number | null; qualifying_count: number }> }).badges;
    expect(badges).toEqual(expect.arrayContaining([
      expect.objectContaining({ badge_key: 'membership' }),
      expect.objectContaining({ badge_key: 'contributor_milestone', threshold: 3, qualifying_count: 3 }),
    ]));
  });

  it('supports a curated logo and keeps invalid logo choices out of the API', async () => {
    const owner = await createTestSession(env, { github_login: 'logo-owner' });
    const created = await post('/api/teams', { name: 'Logo reviewers', description: '', logo_key: 'shield' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(created.status).toBe(200);
    const team = ((await created.json()) as { team: { id: number; logo_key: string } }).team;
    expect(team.logo_key).toBe('shield');

    const invalid = await post(`/api/teams/${team.id}/settings`, { action: 'update', name: 'Logo reviewers', description: '', logo_key: 'data:image/svg+xml;base64,unsafe' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(invalid.status).toBe(400);

    const updated = await post(`/api/teams/${team.id}/settings`, { action: 'update', name: 'Logo reviewers', description: '', logo_key: 'spark' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(((await updated.json()) as { team: { logo_key: string } }).team.logo_key).toBe('spark');
  });

  it('allows a Team manager to upload and remove bounded logo and banner visuals', async () => {
    const owner = await createTestSession(env, { github_login: 'media-owner' });
    const outsider = await createTestSession(env, { github_login: 'media-outsider' });
    const created = await post('/api/teams', { name: 'Visual reviewers', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const upload = async (kind: string, session: { sessionCookie: string; tokenCookie: string }, bytes = png) => {
      const form = new FormData(); form.set('kind', kind); form.set('file', new File([bytes], kind + '.png', { type: 'image/png' }));
      const csrf = makeCsrf();
      return SELF.fetch(new Request(`http://localhost/api/teams/${teamId}/media`, { method: 'POST', headers: { 'x-csrf-token': csrf, Cookie: `__csrf=${csrf}; ${session.sessionCookie}; ${session.tokenCookie}` }, body: form }));
    };
    expect((await upload('logo', outsider)).status).toBe(403);
    expect((await upload('logo', owner)).status).toBe(200);
    expect((await upload('banner', owner)).status).toBe(200);
    const detail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, { headers: { Cookie: `${owner.sessionCookie}; ${owner.tokenCookie}` } }));
    const team = (await detail.json() as { team: { logo_image_data: string; banner_image_data: string } }).team;
    expect(team.logo_image_data).toMatch(/^data:image\/png;base64,/);
    expect(team.banner_image_data).toMatch(/^data:image\/png;base64,/);
    const lists = ['/api/teams', '/api/teams/mine', '/api/teams/leaderboard?period=all_time', '/api/teams/leaderboard?period=90d'];
    for (const path of lists) {
      const response = await SELF.fetch(new Request('http://localhost' + path, { headers: { Cookie: owner.sessionCookie } }));
      expect(response.status).toBe(200);
      const rows = (await response.json() as { teams: { id: number; logo_image_data: string | null; logo_key: string }[] }).teams;
      expect(rows.find(row => row.id === teamId)).toMatchObject({ logo_image_data: team.logo_image_data, logo_key: 'initials' });
    }
    const csrf = makeCsrf();
    const removeForm = new FormData(); removeForm.set('kind', 'logo'); removeForm.set('remove', 'true');
    const removed = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}/media`, { method: 'POST', headers: { 'x-csrf-token': csrf, Cookie: `__csrf=${csrf}; ${owner.sessionCookie}; ${owner.tokenCookie}` }, body: removeForm }));
    expect(removed.status).toBe(200);
    for (const path of lists) {
      const response = await SELF.fetch(new Request('http://localhost' + path, { headers: { Cookie: owner.sessionCookie } }));
      const rows = (await response.json() as { teams: { id: number; logo_image_data: string | null }[] }).teams;
      expect(rows.find(row => row.id === teamId)?.logo_image_data).toBeNull();
    }
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

  it('returns the recent activity leaderboard with per-contributor context', async () => {
    const owner = await createTestSession(env, { github_login: 'recent-owner' });
    const created = await post('/api/teams', { name: 'Recent reviewers', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    await insertTestRepo(env, { id: 8, name: 'recent-repo' });
    await insertTestPR(env, { id: 81, repo_id: 8, repo_name: 'recent-repo', merged_upstream: 1 });
    await env.DB.prepare(`INSERT INTO user_votes (github_login, pr_id, repo_name, pr_number, decision, team_id, voted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind('recent-owner', 81, 'recent-repo', 1, 'accept', teamId, new Date().toISOString()).run();

    const response = await SELF.fetch(new Request('http://localhost/api/teams/leaderboard?period=90d'));
    const body = await response.json() as { period: string; teams: Array<{ id: number; active_contributors: number; validations_per_active_contributor: number }> };
    const row = body.teams.find(team => team.id === teamId);
    expect(body.period).toBe('90d');
    expect(row).toEqual(expect.objectContaining({ active_contributors: 1, validations_per_active_contributor: 1 }));
  });

  it('only allows a Team manager to set a repository focus', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const outsider = await createTestSession(env, { github_login: 'outsider' });
    const created = await post('/api/teams', { name: 'Repository focus', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    await insertTestRepo(env, { id: 17, name: 'focus-repo' });

    const repositoryOptions = await SELF.fetch(new Request('http://localhost/api/teams/repository-options'));
    expect((await repositoryOptions.json() as { repositories: Array<{ id: number }> }).repositories).toContainEqual(expect.objectContaining({ id: 17 }));

    const rejected = await post(`/api/teams/${teamId}/repositories`, { action: 'add', repo_id: 17 }, makeCsrf(), outsider.sessionCookie, outsider.tokenCookie);
    expect(rejected.status).toBe(403);
    const added = await post(`/api/teams/${teamId}/repositories`, { action: 'add', repo_id: 17 }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(added.status).toBe(200);
  });

  it('allows an opened Team to accept a join request', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const requester = await createTestSession(env, { github_login: 'requester' });
    const created = await post('/api/teams', { name: 'Open by request', description: '', membership_mode: 'request' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;

    const requested = await post(`/api/teams/${teamId}/join-requests`, { action: 'request' }, makeCsrf(), requester.sessionCookie, requester.tokenCookie);
    expect(requested.status).toBe(200);
    const ownerDetail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, {
      headers: { Cookie: `${owner.sessionCookie}; ${owner.tokenCookie}` },
    }));
    const requests = (await ownerDetail.json() as { join_requests: Array<{ id: number; requester_login: string }> }).join_requests;
    expect(requests).toEqual([{ id: expect.any(Number), requester_login: 'requester', created_at: expect.any(String) }]);

    const accepted = await post(`/api/teams/${teamId}/join-requests`, { action: 'resolve', request_id: requests[0].id, status: 'accepted' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(accepted.status).toBe(200);
    const requesterDetail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, {
      headers: { Cookie: `${requester.sessionCookie}; ${requester.tokenCookie}` },
    }));
    expect((await requesterDetail.json() as { membership: string }).membership).toBe('member');
  });

  it('makes ownership transfer discoverable and requires acceptance', async () => {
    const owner = await createTestSession(env, { github_login: 'owner' });
    const candidate = await createTestSession(env, { github_login: 'candidate' });
    const created = await post('/api/teams', { name: 'Transfer ownership', description: '' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const teamId = ((await created.json()) as { team: { id: number } }).team.id;
    await post(`/api/teams/${teamId}/members`, { action: 'invite', github_login: 'candidate' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    const candidateMine = await SELF.fetch(new Request('http://localhost/api/teams/mine', { headers: { Cookie: `${candidate.sessionCookie}; ${candidate.tokenCookie}` } }));
    const invite = (await candidateMine.json() as { invites: Array<{ id: number }> }).invites[0];
    await post(`/api/teams/${teamId}/members`, { action: 'accept_invite', invite_id: invite.id }, makeCsrf(), candidate.sessionCookie, candidate.tokenCookie);

    const proposed = await post(`/api/teams/${teamId}/members`, { action: 'propose_transfer', github_login: 'candidate' }, makeCsrf(), owner.sessionCookie, owner.tokenCookie);
    expect(proposed.status).toBe(200);
    const pendingMine = await SELF.fetch(new Request('http://localhost/api/teams/mine', { headers: { Cookie: `${candidate.sessionCookie}; ${candidate.tokenCookie}` } }));
    const transfer = (await pendingMine.json() as { ownership_transfers: Array<{ id: number; team_id: number }> }).ownership_transfers[0];
    expect(transfer.team_id).toBe(teamId);

    const accepted = await post(`/api/teams/${teamId}/members`, { action: 'accept_transfer', transfer_id: transfer.id }, makeCsrf(), candidate.sessionCookie, candidate.tokenCookie);
    expect(accepted.status).toBe(200);
    const detail = await SELF.fetch(new Request(`http://localhost/api/teams/${teamId}`, { headers: { Cookie: `${candidate.sessionCookie}; ${candidate.tokenCookie}` } }));
    expect((await detail.json() as { membership: string }).membership).toBe('owner');
  });
});
