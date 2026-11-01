import type { Env } from '../types.js';
import { getRequestPrincipal, roleAllows } from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';
import { parseBody } from '../validation.js';
import { linkContributionProfile } from '../contributionIdentity.js';
import { validateOtherInterest, validateRoleInterests } from '../contributionRoles.js';

export async function contributionProfile(db: D1Database, id: number) {
  const profile = await db.prepare('SELECT github_user_id, github_login, interests, other_interest, interests_updated_at FROM contribution_profiles WHERE github_user_id = ?')
    .bind(id).first<{ github_user_id: number; github_login: string; interests: string; other_interest: string; interests_updated_at: string | null }>();
  if (!profile) return null;
  const assignments = await db.prepare(`SELECT a.id, a.repo_id, r.full_name AS repository, a.role, a.status, a.assigned_at, a.ended_at
    FROM contribution_assignments a JOIN repos r ON r.id = a.repo_id WHERE a.github_user_id = ? ORDER BY a.status, a.assigned_at DESC, a.id DESC LIMIT 200`)
    .bind(id).all();
  return { ...profile, interests: JSON.parse(profile.interests), assignments: assignments.results };
}
export async function handleMyContributionRoles(request: Request, env: Env): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to manage your role interests.', 401, request);
  const id = principal.session.github_user_id;
  if (!id) return jsonErr('Please sign out and sign in again to verify your GitHub identity.', 409, request);
  if (request.method === 'PUT') {
    if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
    const parsed = await parseBody(request);
    if (!parsed.ok) return jsonErr(parsed.error, 400, request);
    if (Object.keys(parsed.val).some(key => !['interests', 'other_interest'].includes(key))) return jsonErr('Only role interests can be updated here.', 400, request);
    const interests = validateRoleInterests(parsed.val.interests);
    if (!interests) return jsonErr('Invalid role interests', 400, request);
    const current = await env.DB.prepare('SELECT other_interest FROM contribution_profiles WHERE github_user_id = ?').bind(id).first<{ other_interest: string }>();
    const proposedOther = parsed.val.other_interest === undefined && interests.includes('other') ? current?.other_interest : parsed.val.other_interest;
    const otherInterest = validateOtherInterest(proposedOther, interests.includes('other'));
    if (!otherInterest.ok) return jsonErr(otherInterest.error, 400, request);
    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO contribution_profiles (github_user_id, github_login, interests, other_interest, interests_updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(github_user_id) DO UPDATE SET
      github_login = excluded.github_login, interests = excluded.interests, other_interest = excluded.other_interest, interests_updated_at = excluded.interests_updated_at`)
      .bind(id, principal.session.github_login, JSON.stringify(interests), otherInterest.val, now, now).run();
  } else {
    // Session identity is trusted; a typed signup handle is never an ownership claim.
    await linkContributionProfile(env.DB, id, principal.session.github_login);
  }
  return jsonOk({ profile: await contributionProfile(env.DB, id) }, request, { cache: 'no-store' });
}

export async function handleContributionAdmin(request: Request, env: Env): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required', 403, request);
  const actorId = principal.session.github_user_id;
  if (!actorId) return jsonErr('Please sign out and sign in again to verify your GitHub identity.', 409, request);
  const url = new URL(request.url);
  if (request.method === 'GET') {
    if (url.searchParams.has('member')) {
      const member = Number(url.searchParams.get('member'));
      if (!Number.isSafeInteger(member) || member <= 0) return jsonErr('Invalid member', 400, request);
      const profile = await contributionProfile(env.DB, member);
      return profile ? jsonOk({ profile }, request, { cache: 'no-store' }) : jsonErr('Member not found', 404, request);
    }
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
    const members = await env.DB.prepare(`SELECT github_user_id, github_login FROM contribution_profiles
      WHERE github_login LIKE ? ORDER BY github_login COLLATE NOCASE LIMIT 50`).bind('%' + q + '%').all();
    const repoQuery = (url.searchParams.get('repo_q') ?? '').trim().slice(0, 100);
    const repos = await env.DB.prepare('SELECT id, full_name FROM repos WHERE active = 1 AND full_name LIKE ? ORDER BY full_name LIMIT 100').bind('%' + repoQuery + '%').all();
    return jsonOk({ members: members.results, repositories: repos.results }, request, { cache: 'no-store' });
  }
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, 400, request);
  const body = parsed.val;
  const id = body.github_user_id;
  const repo = body.repo_id;
  const role = body.role;
  const action = body.action;
  if (Object.keys(body).some(key => !['github_user_id', 'repo_id', 'role', 'action'].includes(key))
    || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0
    || typeof repo !== 'number' || !Number.isSafeInteger(repo) || repo <= 0
    || typeof role !== 'string' || !['steward', 'contact'].includes(role) || typeof action !== 'string' || !['assign', 'end'].includes(action)) return jsonErr('Invalid assignment', 400, request);
  const profile = await env.DB.prepare('SELECT 1 FROM contribution_profiles WHERE github_user_id = ?').bind(id).first();
  const repository = await env.DB.prepare('SELECT active FROM repos WHERE id = ?').bind(repo).first<{ active: number }>();
  if (!profile || !repository) return jsonErr('Member or repository not found', 404, request);
  if (action === 'assign' && !repository.active) return jsonErr('This repository is no longer active.', 400, request);
  if (action === 'end' && !await env.DB.prepare('SELECT 1 FROM contribution_assignments WHERE github_user_id = ? AND repo_id = ? AND role = ?').bind(id, repo, role).first()) return jsonErr('Assignment not found', 404, request);
  const now = new Date().toISOString();
  const mutation = action === 'assign'
    ? env.DB.prepare(`INSERT INTO contribution_assignments (github_user_id, repo_id, role, assigned_by, assigned_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(github_user_id, repo_id, role) WHERE status = 'active' DO NOTHING`).bind(id, repo, role, actorId, now)
    : env.DB.prepare(`UPDATE contribution_assignments SET status = 'ended', ended_at = ?, ended_by = ?
        WHERE github_user_id = ? AND repo_id = ? AND role = ? AND status = 'active'`).bind(now, actorId, id, repo, role);
  // Atomic with the write: assignment changes cannot succeed without an audit record.
  await env.DB.batch([mutation, env.DB.prepare(`INSERT INTO privileged_action_audit
    (id, github_user_id, github_login, role, action, target_type, target_id, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, 'contribution_assignment', ?, 'succeeded', ?)`)
    .bind(crypto.randomUUID(), actorId, principal.session.github_login, principal.role,
      'contribution_assignment.' + action, `${id}:${repo}:${role}`, now)]);
  return jsonOk({ profile: await contributionProfile(env.DB, id) }, request, { cache: 'no-store' });
}
