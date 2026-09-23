/**
 * Community Team handlers.
 *
 * Public responses deliberately contain aggregate Team data only. Member
 * identities, invitations, requests, and attributed validation activity are
 * returned only to current Team members.
 */

import type { Env } from '../types.js';
import { isAdminRequest, jsonErr, jsonOk, validateCSRF } from '../security.js';
import { getSession, type SessionUser } from './auth.js';
import { parseBody, vGitHub, vText } from '../validation.js';
import { isTeamBadgeThreshold, listTeamBadges, syncTeamBadges, type TeamBadgeSettings } from '../teamBadges.js';

type TeamRole = 'owner' | 'admin' | 'member';
type MembershipMode = 'invite_only' | 'request';
type TeamLogoKey = 'initials' | 'shield' | 'bug' | 'lock' | 'spark' | 'code' | 'leaf';
const TEAM_LOGO_KEYS = new Set<TeamLogoKey>(['initials', 'shield', 'bug', 'lock', 'spark', 'code', 'leaf']);

interface TeamRow {
  id: number;
  name: string;
  description: string;
  logo_key: TeamLogoKey;
  membership_mode: MembershipMode;
  status: 'active' | 'archived' | 'suspended';
  owner_login: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  suspended_at: string | null;
}

const TEAM_NAME_MAX = 80;
const TEAM_DESCRIPTION_MAX = 500;

function now(): string { return new Date().toISOString(); }

async function requireUser(request: Request, env: Env): Promise<SessionUser | Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const user = await getSession(request, env);
  return user ?? jsonErr('Not authenticated — please sign in with GitHub', 401, request);
}

function isResponse(value: SessionUser | Response): value is Response {
  return value instanceof Response;
}

async function getTeam(env: Env, teamId: number): Promise<TeamRow | null> {
  return env.DB.prepare(
    `SELECT id, name, description, logo_key, membership_mode, status, owner_login,
            created_at, updated_at, archived_at, suspended_at
       FROM teams WHERE id = ?`,
  ).bind(teamId).first<TeamRow>();
}

async function currentMembership(env: Env, teamId: number, login: string): Promise<{ id: number; role: TeamRole } | null> {
  return env.DB.prepare(
    `SELECT id, role FROM team_memberships
      WHERE team_id = ? AND github_login = ? AND left_at IS NULL`,
  ).bind(teamId, login).first<{ id: number; role: TeamRole }>();
}

async function requireManager(env: Env, teamId: number, login: string): Promise<{ role: TeamRole } | null> {
  const membership = await currentMembership(env, teamId, login);
  return membership && (membership.role === 'owner' || membership.role === 'admin') ? membership : null;
}

async function addMembership(env: Env, teamId: number, login: string, role: TeamRole, timestamp: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO team_memberships (team_id, github_login, role, joined_at)
     VALUES (?, ?, ?, ?)`,
  ).bind(teamId, login, role, timestamp).run();
  await syncTeamBadges(env, teamId, login);
}

async function publicSummary(env: Env, where = '', bindings: unknown[] = []): Promise<unknown[]> {
  const sql = `
    SELECT t.id, t.name, t.description, t.logo_key, t.membership_mode, t.status, t.created_at,
      (SELECT COUNT(*) FROM team_memberships tm WHERE tm.team_id = t.id AND tm.left_at IS NULL) AS member_count,
      (SELECT COUNT(*) FROM user_votes uv WHERE uv.team_id = t.id) AS attributed_validations,
      (SELECT COUNT(*) FROM user_votes uv JOIN pull_requests pr ON pr.id = uv.pr_id
        WHERE uv.team_id = t.id AND pr.merged_upstream = 1) AS accepted_outcome_reviews
    FROM teams t ${where}
    ORDER BY t.name COLLATE NOCASE`;
  const rows = await env.DB.prepare(sql).bind(...bindings).all();
  return rows.results ?? [];
}

function logoKey(value: unknown, fallback: TeamLogoKey = 'initials'): TeamLogoKey | null {
  if (value === undefined || value === null || value === '') return fallback;
  return typeof value === 'string' && TEAM_LOGO_KEYS.has(value as TeamLogoKey) ? value as TeamLogoKey : null;
}

/** GET /api/teams — public aggregate Team directory. */
export async function handleTeams(env: Env, request: Request): Promise<Response> {
  return jsonOk({ teams: await publicSummary(env) }, request, { cache: 'public, max-age=60' });
}

/** GET /api/teams/repository-options — active OASIS repositories for Team focus. */
export async function handleTeamRepositoryOptions(env: Env, request: Request): Promise<Response> {
  const rows = await env.DB.prepare(`
    SELECT id, name FROM repos WHERE active = 1 ORDER BY name COLLATE NOCASE
  `).all();
  return jsonOk({ repositories: rows.results ?? [] }, request, { cache: 'public, max-age=60' });
}

/** GET /api/teams/leaderboard?period=all_time|90d */
export async function handleTeamLeaderboard(env: Env, request: Request, url: URL): Promise<Response> {
  const period = url.searchParams.get('period') === '90d' ? '90d' : 'all_time';
  const windowClause = period === '90d' ? "AND uv.voted_at >= datetime('now', '-90 days')" : '';
  const rows = await env.DB.prepare(`
    SELECT t.id, t.name, t.logo_key, t.status,
      (SELECT COUNT(*) FROM user_votes uv JOIN pull_requests pr ON pr.id = uv.pr_id
        WHERE uv.team_id = t.id AND pr.merged_upstream = 1 ${windowClause}) AS accepted_outcome_reviews,
      (SELECT COUNT(*) FROM user_votes uv WHERE uv.team_id = t.id ${period === '90d' ? "AND uv.voted_at >= datetime('now', '-90 days')" : ''}) AS attributed_validations,
      (SELECT COUNT(DISTINCT uv.github_login) FROM user_votes uv
        WHERE uv.team_id = t.id AND uv.voted_at >= datetime('now', '-90 days')) AS active_contributors
    FROM teams t
    ORDER BY accepted_outcome_reviews DESC, attributed_validations DESC, t.name COLLATE NOCASE
  `).all<Record<string, unknown>>();
  const teams = (rows.results ?? []).map((row) => {
    const active = Number(row.active_contributors ?? 0);
    return { ...row, validations_per_active_contributor: active ? Number(row.attributed_validations ?? 0) / active : 0 };
  });
  return jsonOk({ period, teams }, request, { cache: 'public, max-age=60' });
}

/** GET /api/teams/mine — current user's Teams and pending invitations. */
export async function handleMyTeams(request: Request, env: Env): Promise<Response> {
  const user = await getSession(request, env);
  if (!user) return jsonErr('Not authenticated — please sign in with GitHub', 401, request);
  const [memberships, invites, joinRequests, ownershipTransfers] = await Promise.all([
    env.DB.prepare(`
      SELECT t.id, t.name, t.description, t.membership_mode, t.status, tm.role, tm.joined_at
        FROM team_memberships tm JOIN teams t ON t.id = tm.team_id
       WHERE tm.github_login = ? AND tm.left_at IS NULL
       ORDER BY t.name COLLATE NOCASE
    `).bind(user.github_login).all(),
    env.DB.prepare(`
      SELECT i.id, i.team_id, t.name AS team_name, i.created_at
        FROM team_invites i JOIN teams t ON t.id = i.team_id
       WHERE i.invitee_login = ? AND i.status = 'pending' AND t.status = 'active'
       ORDER BY i.created_at DESC
    `).bind(user.github_login).all(),
    env.DB.prepare(`
      SELECT jr.id, jr.team_id, t.name AS team_name, jr.created_at
        FROM team_join_requests jr JOIN teams t ON t.id = jr.team_id
       WHERE jr.requester_login = ? AND jr.status = 'pending' AND t.status = 'active'
       ORDER BY jr.created_at DESC
    `).bind(user.github_login).all(),
    env.DB.prepare(`
      SELECT ot.id, ot.team_id, t.name AS team_name, ot.created_at
        FROM team_ownership_transfers ot JOIN teams t ON t.id = ot.team_id
       WHERE ot.proposed_owner = ? AND ot.status = 'pending' AND t.status = 'active'
       ORDER BY ot.created_at DESC
    `).bind(user.github_login).all(),
  ]);
  return jsonOk({
    teams: memberships.results ?? [],
    invites: invites.results ?? [],
    join_requests: joinRequests.results ?? [],
    ownership_transfers: ownershipTransfers.results ?? [],
  }, request);
}

/** POST /api/teams */
export async function handleCreateTeam(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const name = vText(parsed.val.name, TEAM_NAME_MAX, 'Team name');
  const description = vText(parsed.val.description, TEAM_DESCRIPTION_MAX, 'Description');
  if (!name.ok || !name.val) return jsonErr(name.ok ? 'Team name is required' : name.error, 400, request);
  if (!description.ok) return jsonErr(description.error, 400, request);
  const selectedLogo = logoKey(parsed.val.logo_key);
  if (!selectedLogo) return jsonErr('Choose a supported Team logo', 400, request);
  const mode = parsed.val.membership_mode === 'request' ? 'request' : 'invite_only';
  const timestamp = now();
  try {
    const result = await env.DB.prepare(
      `INSERT INTO teams (name, description, logo_key, membership_mode, status, owner_login, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).bind(name.val, description.val, selectedLogo, mode, user.github_login, timestamp, timestamp).run();
    const teamId = Number(result.meta.last_row_id);
    await env.DB.prepare(
      `INSERT INTO team_badge_settings (team_id, contribution_threshold, updated_by, updated_at)
       VALUES (?, 5, ?, ?)`,
    ).bind(teamId, user.github_login, timestamp).run();
    await addMembership(env, teamId, user.github_login, 'owner', timestamp);
    return jsonOk({ team: await getTeam(env, teamId) }, request);
  } catch (error) {
    if ((error as Error).message.includes('UNIQUE')) return jsonErr('A Team with that name already exists', 409, request);
    throw error;
  }
}

/** GET /api/teams/:id — public summary, plus private member data for members. */
export async function handleTeamDetail(request: Request, env: Env, teamId: number): Promise<Response> {
  const team = await getTeam(env, teamId);
  if (!team) return jsonErr('Team not found', 404, request);
  const summary = (await publicSummary(env, 'WHERE t.id = ?', [teamId]))[0];
  const user = await getSession(request, env);
  const membership = user ? await currentMembership(env, teamId, user.github_login) : null;
  if (!membership) return jsonOk({ team: summary }, request, { cache: 'public, max-age=60' });

  await syncTeamBadges(env, teamId, user!.github_login);

  const [members, activity, repositories, requests, invites, transfers, badgeSettings, badges, userBadgePreference] = await Promise.all([
    env.DB.prepare(`SELECT github_login, role, joined_at FROM team_memberships WHERE team_id = ? AND left_at IS NULL ORDER BY role = 'owner' DESC, role = 'admin' DESC, github_login COLLATE NOCASE`).bind(teamId).all(),
    env.DB.prepare(`SELECT uv.github_login, uv.pr_id, uv.repo_name, uv.pr_number, uv.decision, uv.voted_at, pr.title
      FROM user_votes uv JOIN pull_requests pr ON pr.id = uv.pr_id WHERE uv.team_id = ? ORDER BY uv.voted_at DESC LIMIT 100`).bind(teamId).all(),
    env.DB.prepare(`SELECT r.id, r.name, r.full_name, r.description FROM team_repositories tr JOIN repos r ON r.id = tr.repo_id WHERE tr.team_id = ? AND r.active = 1 ORDER BY r.name COLLATE NOCASE`).bind(teamId).all(),
    membership.role === 'owner' || membership.role === 'admin'
      ? env.DB.prepare(`SELECT id, requester_login, created_at FROM team_join_requests WHERE team_id = ? AND status = 'pending' ORDER BY created_at`).bind(teamId).all()
      : Promise.resolve({ results: [] }),
    membership.role === 'owner' || membership.role === 'admin'
      ? env.DB.prepare(`SELECT id, invitee_login, created_at FROM team_invites WHERE team_id = ? AND status = 'pending' ORDER BY created_at`).bind(teamId).all()
      : Promise.resolve({ results: [] }),
    membership.role === 'owner'
      ? env.DB.prepare(`SELECT id, proposed_owner, created_at FROM team_ownership_transfers WHERE team_id = ? AND status = 'pending'`).bind(teamId).all()
      : Promise.resolve({ results: [] }),
    env.DB.prepare(`SELECT contribution_threshold, public_display, updated_at FROM team_badge_settings WHERE team_id = ?`).bind(teamId).first<TeamBadgeSettings>(),
    listTeamBadges(env, teamId, user!.github_login),
    env.DB.prepare('SELECT show_team_badges FROM user_preferences WHERE github_login = ?').bind(user!.github_login).first<{ show_team_badges: number }>(),
  ]);
  return jsonOk({ team: summary, membership: membership.role, members: members.results ?? [], activity: activity.results ?? [], repositories: repositories.results ?? [], join_requests: requests.results ?? [], invites: invites.results ?? [], ownership_transfers: transfers.results ?? [], badge_settings: badgeSettings, badges, user_badges_public: userBadgePreference?.show_team_badges === 1 }, request);
}

/** POST /api/teams/:id/settings */
export async function handleTeamSettings(request: Request, env: Env, teamId: number): Promise<Response> {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const team = await getTeam(env, teamId);
  if (!team) return jsonErr('Team not found', 404, request);
  const membership = await requireManager(env, teamId, user.github_login);
  if (!membership) return jsonErr('Only a Team owner or admin can manage this Team', 403, request);
  const action = parsed.val.action;
  const timestamp = now();
  if (action === 'update') {
    const name = vText(parsed.val.name ?? team.name, TEAM_NAME_MAX, 'Team name');
    const description = vText(parsed.val.description ?? team.description, TEAM_DESCRIPTION_MAX, 'Description');
    if (!name.ok || !name.val) return jsonErr(name.ok ? 'Team name is required' : name.error, 400, request);
    if (!description.ok) return jsonErr(description.error, 400, request);
    const selectedLogo = logoKey(parsed.val.logo_key, team.logo_key);
    if (!selectedLogo) return jsonErr('Choose a supported Team logo', 400, request);
    const mode = parsed.val.membership_mode === 'request' ? 'request' : 'invite_only';
    const contributionThreshold = parsed.val.contribution_threshold === undefined
      ? null
      : Number(parsed.val.contribution_threshold);
    if (contributionThreshold !== null && !isTeamBadgeThreshold(contributionThreshold)) {
      return jsonErr('Choose a supported contribution badge threshold', 400, request);
    }
    const publicBadges = parsed.val.public_badges === undefined ? null : parsed.val.public_badges === true;
    try {
      await env.DB.prepare('UPDATE teams SET name = ?, description = ?, logo_key = ?, membership_mode = ?, updated_at = ? WHERE id = ?')
        .bind(name.val, description.val, selectedLogo, mode, timestamp, teamId).run();
      if (contributionThreshold !== null) {
        await env.DB.prepare(
          `INSERT INTO team_badge_settings (team_id, contribution_threshold, updated_by, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(team_id) DO UPDATE SET contribution_threshold = excluded.contribution_threshold, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        ).bind(teamId, contributionThreshold, user.github_login, timestamp).run();
        const currentMembers = await env.DB.prepare(
          'SELECT github_login FROM team_memberships WHERE team_id = ? AND left_at IS NULL',
        ).bind(teamId).all<{ github_login: string }>();
        for (const member of currentMembers.results ?? []) await syncTeamBadges(env, teamId, member.github_login);
      }
      if (publicBadges !== null) {
        await env.DB.prepare(
          `INSERT INTO team_badge_settings (team_id, contribution_threshold, public_display, updated_by, updated_at)
           VALUES (?, COALESCE((SELECT contribution_threshold FROM team_badge_settings WHERE team_id = ?), 5), ?, ?, ?)
           ON CONFLICT(team_id) DO UPDATE SET public_display = excluded.public_display, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        ).bind(teamId, teamId, publicBadges ? 1 : 0, user.github_login, timestamp).run();
      }
    } catch (error) {
      if ((error as Error).message.includes('UNIQUE')) return jsonErr('A Team with that name already exists', 409, request);
      throw error;
    }
  } else if (action === 'archive' || action === 'reactivate') {
    if (membership.role !== 'owner') return jsonErr('Only the Team owner can archive or reactivate this Team', 403, request);
    if (action === 'archive' && team.status !== 'active') return jsonErr('Only an active Team can be archived', 409, request);
    if (action === 'reactivate' && team.status !== 'archived') return jsonErr('Only an archived Team can be reactivated', 409, request);
    const archived = action === 'archive';
    await env.DB.prepare('UPDATE teams SET status = ?, archived_at = ?, updated_at = ? WHERE id = ?')
      .bind(archived ? 'archived' : 'active', archived ? timestamp : null, timestamp, teamId).run();
  } else {
    return jsonErr('Unknown Team settings action', 400, request);
  }
  return jsonOk({ team: await getTeam(env, teamId) }, request);
}

/** POST /api/teams/:id/members — invitation, role, removal, and ownership actions. */
export async function handleTeamMembers(request: Request, env: Env, teamId: number): Promise<Response> {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const team = await getTeam(env, teamId);
  if (!team) return jsonErr('Team not found', 404, request);
  if (team.status !== 'active') return jsonErr('This Team is not active', 409, request);
  const action = parsed.val.action;
  const timestamp = now();

  if (action === 'accept_invite') {
    const invite = await env.DB.prepare(`SELECT id FROM team_invites WHERE id = ? AND team_id = ? AND invitee_login = ? AND status = 'pending'`)
      .bind(parsed.val.invite_id, teamId, user.github_login).first<{ id: number }>();
    if (!invite) return jsonErr('Invitation not found', 404, request);
    await addMembership(env, teamId, user.github_login, 'member', timestamp);
    await env.DB.prepare(`UPDATE team_invites SET status = 'accepted', resolved_at = ? WHERE id = ?`).bind(timestamp, invite.id).run();
    return jsonOk({ joined: true }, request);
  }

  if (action === 'accept_transfer') {
    const transfer = await env.DB.prepare(`SELECT id FROM team_ownership_transfers WHERE id = ? AND team_id = ? AND proposed_owner = ? AND status = 'pending'`)
      .bind(parsed.val.transfer_id, teamId, user.github_login).first<{ id: number }>();
    if (!transfer) return jsonErr('Ownership transfer not found', 404, request);
    await env.DB.batch([
      env.DB.prepare(`UPDATE team_memberships SET role = 'member' WHERE team_id = ? AND role = 'owner' AND left_at IS NULL`).bind(teamId),
      env.DB.prepare(`UPDATE team_memberships SET role = 'owner' WHERE team_id = ? AND github_login = ? AND left_at IS NULL`).bind(teamId, user.github_login),
      env.DB.prepare(`UPDATE teams SET owner_login = ?, updated_at = ? WHERE id = ?`).bind(user.github_login, timestamp, teamId),
      env.DB.prepare(`UPDATE team_ownership_transfers SET status = 'accepted', resolved_at = ? WHERE id = ?`).bind(timestamp, transfer.id),
    ]);
    return jsonOk({ transferred: true }, request);
  }

  if (action === 'leave') {
    const current = await currentMembership(env, teamId, user.github_login);
    if (!current) return jsonErr('You are not a current member of this Team', 404, request);
    if (current.role === 'owner') return jsonErr('Transfer ownership before leaving this Team', 409, request);
    await env.DB.prepare(`UPDATE team_memberships SET left_at = ?, left_reason = 'left' WHERE id = ?`)
      .bind(timestamp, current.id).run();
    return jsonOk({ left: true }, request);
  }

  const membership = await requireManager(env, teamId, user.github_login);
  if (!membership) return jsonErr('Only a Team owner or admin can manage members', 403, request);
  const loginResult = vGitHub(parsed.val.github_login);
  if (!loginResult.ok || !loginResult.val) return jsonErr(loginResult.ok ? 'GitHub login is required' : loginResult.error, 400, request);
  const login = loginResult.val;

  if (action === 'invite') {
    const existing = await currentMembership(env, teamId, login);
    if (existing) return jsonErr('That member is already on this Team', 409, request);
    try {
      await env.DB.prepare(`INSERT INTO team_invites (team_id, invitee_login, invited_by, created_at) VALUES (?, ?, ?, ?)`)
        .bind(teamId, login, user.github_login, timestamp).run();
      return jsonOk({ invited: login }, request);
    } catch (error) {
      if ((error as Error).message.includes('UNIQUE')) return jsonErr('That member already has a pending invitation', 409, request);
      throw error;
    }
  }
  if (action === 'remove') {
    const target = await currentMembership(env, teamId, login);
    if (!target) return jsonErr('Member not found', 404, request);
    if (target.role === 'owner') return jsonErr('Transfer ownership or archive the Team before removing its owner', 409, request);
    await env.DB.prepare(`UPDATE team_memberships SET left_at = ?, left_reason = 'removed' WHERE id = ?`).bind(timestamp, target.id).run();
    return jsonOk({ removed: login }, request);
  }
  if (action === 'set_admin') {
    if (membership.role !== 'owner') return jsonErr('Only the Team owner can change admin roles', 403, request);
    const target = await currentMembership(env, teamId, login);
    if (!target) return jsonErr('Member not found', 404, request);
    const role: TeamRole = parsed.val.role === 'admin' ? 'admin' : 'member';
    if (target.role === 'owner') return jsonErr('Transfer ownership instead of changing the owner role', 409, request);
    await env.DB.prepare('UPDATE team_memberships SET role = ? WHERE id = ?').bind(role, target.id).run();
    return jsonOk({ github_login: login, role }, request);
  }
  if (action === 'propose_transfer') {
    if (membership.role !== 'owner') return jsonErr('Only the Team owner can transfer ownership', 403, request);
    const target = await currentMembership(env, teamId, login);
    if (!target) return jsonErr('Ownership can only be transferred to a current Team member', 409, request);
    try {
      await env.DB.prepare(`INSERT INTO team_ownership_transfers (team_id, proposed_owner, proposed_by, created_at) VALUES (?, ?, ?, ?)`)
        .bind(teamId, login, user.github_login, timestamp).run();
      return jsonOk({ proposed_owner: login }, request);
    } catch (error) {
      if ((error as Error).message.includes('UNIQUE')) return jsonErr('An ownership transfer is already pending', 409, request);
      throw error;
    }
  }
  return jsonErr('Unknown Team member action', 400, request);
}

/** POST /api/teams/:id/join-requests */
export async function handleTeamJoinRequests(request: Request, env: Env, teamId: number): Promise<Response> {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const team = await getTeam(env, teamId);
  if (!team) return jsonErr('Team not found', 404, request);
  if (team.status !== 'active') return jsonErr('This Team is not active', 409, request);
  const action = parsed.val.action;
  const timestamp = now();
  if (action === 'request') {
    if (team.membership_mode !== 'request') return jsonErr('This Team is invite-only', 403, request);
    if (await currentMembership(env, teamId, user.github_login)) return jsonErr('You are already a member of this Team', 409, request);
    try {
      await env.DB.prepare(`INSERT INTO team_join_requests (team_id, requester_login, created_at) VALUES (?, ?, ?)`)
        .bind(teamId, user.github_login, timestamp).run();
      return jsonOk({ requested: true }, request);
    } catch (error) {
      if ((error as Error).message.includes('UNIQUE')) return jsonErr('You already have a pending request', 409, request);
      throw error;
    }
  }
  const manager = await requireManager(env, teamId, user.github_login);
  if (!manager) return jsonErr('Only a Team owner or admin can resolve join requests', 403, request);
  if (action !== 'resolve') return jsonErr('Unknown join request action', 400, request);
  const requestId = typeof parsed.val.request_id === 'number' ? parsed.val.request_id : 0;
  const status = parsed.val.status === 'accepted' ? 'accepted' : parsed.val.status === 'declined' ? 'declined' : null;
  if (!requestId || !status) return jsonErr('A request id and accepted or declined status are required', 400, request);
  const joinRequest = await env.DB.prepare(`SELECT requester_login FROM team_join_requests WHERE id = ? AND team_id = ? AND status = 'pending'`)
    .bind(requestId, teamId).first<{ requester_login: string }>();
  if (!joinRequest) return jsonErr('Join request not found', 404, request);
  if (status === 'accepted') await addMembership(env, teamId, joinRequest.requester_login, 'member', timestamp);
  await env.DB.prepare(`UPDATE team_join_requests SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`)
    .bind(status, user.github_login, timestamp, requestId).run();
  return jsonOk({ status }, request);
}

/** POST /api/teams/:id/repositories */
export async function handleTeamRepositories(request: Request, env: Env, teamId: number): Promise<Response> {
  const user = await requireUser(request, env);
  if (isResponse(user)) return user;
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  if (!await requireManager(env, teamId, user.github_login)) return jsonErr('Only a Team owner or admin can manage repositories', 403, request);
  const team = await getTeam(env, teamId);
  if (!team) return jsonErr('Team not found', 404, request);
  if (team.status !== 'active') return jsonErr('This Team is not active', 409, request);
  const repoId = typeof parsed.val.repo_id === 'number' && Number.isInteger(parsed.val.repo_id) ? parsed.val.repo_id : 0;
  if (!repoId) return jsonErr('repo_id must be a positive integer', 400, request);
  if (parsed.val.action === 'add') {
    const repo = await env.DB.prepare('SELECT id FROM repos WHERE id = ? AND active = 1').bind(repoId).first();
    if (!repo) return jsonErr('Repository not found', 404, request);
    await env.DB.prepare('INSERT OR IGNORE INTO team_repositories (team_id, repo_id, added_by, created_at) VALUES (?, ?, ?, ?)')
      .bind(teamId, repoId, user.github_login, now()).run();
    return jsonOk({ added: repoId }, request);
  }
  if (parsed.val.action === 'remove') {
    await env.DB.prepare('DELETE FROM team_repositories WHERE team_id = ? AND repo_id = ?').bind(teamId, repoId).run();
    return jsonOk({ removed: repoId }, request);
  }
  return jsonErr('Unknown repository action', 400, request);
}

/** POST /api/teams/:id/admin — operational moderation only. */
export async function handleTeamAdmin(request: Request, env: Env, teamId: number): Promise<Response> {
  if (!isAdminRequest(request, env)) return jsonErr('Unauthorised', 401, request);
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const status = parsed.val.action === 'suspend' ? 'suspended' : parsed.val.action === 'archive' ? 'archived' : null;
  if (!status) return jsonErr('Admin action must be suspend or archive', 400, request);
  const timestamp = now();
  const result = await env.DB.prepare(`UPDATE teams SET status = ?, archived_at = ?, suspended_at = ?, updated_at = ? WHERE id = ?`)
    .bind(status, status === 'archived' ? timestamp : null, status === 'suspended' ? timestamp : null, timestamp, teamId).run();
  if (!result.meta.changes) return jsonErr('Team not found', 404, request);
  return jsonOk({ status }, request);
}
