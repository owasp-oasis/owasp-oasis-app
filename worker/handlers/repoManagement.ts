import type { Env } from '../types.js';
import { getRequestPrincipal, recordPrivilegedAction, roleAllows } from '../authorization.js';
import { ghFetch } from '../github.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';

interface RepoRow { id: number; name: string; full_name: string; active: number }
interface GitHubUser { id: number; login: string; name?: string | null }

const PROTECTED_ROLE_NAMES = new Set([
  'steward', 'repo steward', 'security steward', 'repo security steward',
  'maintainer', 'upstream maintainer', 'member', 'repo member',
]);

function isProtectedRoleName(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/^oasis\s+/, '');
  return PROTECTED_ROLE_NAMES.has(normalized);
}

async function repoExists(env: Env, repoId: number): Promise<RepoRow | null> {
  return env.DB.prepare('SELECT id, name, full_name, active FROM repos WHERE id = ? AND active = 1')
    .bind(repoId).first<RepoRow>();
}

async function isRepoSteward(env: Env, repoId: number, userId: number | null): Promise<boolean> {
  if (!userId) return false;
  const row = await env.DB.prepare('SELECT 1 AS is_steward FROM repository_stewards WHERE oasis_repo_id = ? AND github_user_id = ?')
    .bind(repoId, userId).first<{ is_steward: number }>();
  return Boolean(row);
}

async function requireSteward(request: Request, env: Env, repoId: number) {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return { response: jsonErr('Sign in with GitHub to manage repo roles', 401, request) };
  if (!await isRepoSteward(env, repoId, principal.session.github_user_id)) {
    return { response: jsonErr('The assigned OASIS Repo Security Steward is required', 403, request) };
  }
  return { principal };
}

export async function handleRepoManagement(request: Request, env: Env, repoId: number): Promise<Response> {
  const repo = await repoExists(env, repoId);
  if (!repo) return jsonErr('OASIS repository not found', 404, request);
  const principal = await getRequestPrincipal(request, env);

  if (request.method === 'GET') {
    const [steward, roles, maintainers, ownRequest, openRequest, pendingRequest] = await Promise.all([
      env.DB.prepare('SELECT github_user_id, github_login, github_name, assigned_at FROM repository_stewards WHERE oasis_repo_id = ?')
        .bind(repoId).first<Record<string, unknown>>(),
      env.DB.prepare(`SELECT id, github_user_id, github_login, github_name, role_name, role_description, created_at, updated_at
        FROM repository_role_assignments WHERE oasis_repo_id = ? AND removed_at IS NULL ORDER BY role_name COLLATE NOCASE, github_login COLLATE NOCASE`)
        .bind(repoId).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT github_user_id, github_login, github_name, github_permission, verified_at
        FROM verified_upstream_maintainers WHERE oasis_repo_id = ? AND removed_at IS NULL
        ORDER BY github_login COLLATE NOCASE`).bind(repoId).all<Record<string, unknown>>(),
      principal.session?.github_user_id
        ? env.DB.prepare(`SELECT id, status, requested_at, reviewed_at FROM repository_stewardship_requests
            WHERE oasis_repo_id = ? AND requester_github_user_id = ? ORDER BY requested_at DESC LIMIT 1`)
          .bind(repoId, principal.session.github_user_id).first<Record<string, unknown>>()
        : Promise.resolve(null),
      env.DB.prepare(`SELECT 1 AS pending FROM repository_stewardship_requests WHERE oasis_repo_id = ? AND status = 'pending' LIMIT 1`)
        .bind(repoId).first<{ pending: number }>(),
      roleAllows(principal.role, 'admin')
        ? env.DB.prepare(`SELECT id, requester_github_user_id, requester_login, requester_name, requested_at
            FROM repository_stewardship_requests WHERE oasis_repo_id = ? AND status = 'pending' LIMIT 1`)
          .bind(repoId).first<Record<string, unknown>>()
        : Promise.resolve(null),
    ]);

    return jsonOk({
      repo: { id: repo.id, name: repo.name, full_name: repo.full_name },
      steward: steward ?? null,
      role_assignments: roles.results ?? [],
      maintainers: maintainers.results ?? [],
      viewer: {
        github_user_id: principal.session?.github_user_id ?? null,
        github_login: principal.session?.github_login ?? null,
        is_admin: roleAllows(principal.role, 'admin'),
        is_steward: await isRepoSteward(env, repoId, principal.session?.github_user_id ?? null),
        request: ownRequest ?? null,
        open_request_exists: Boolean(openRequest),
        pending_request: pendingRequest ?? null,
      },
    }, request, { cache: 'no-store' });
  }

  if (request.method !== 'POST') return jsonErr('Method not allowed', 405, request);
  if (!principal.session) return jsonErr('Sign in with GitHub to request stewardship', 401, request);
  if (!principal.session.github_user_id) return jsonErr('A linked immutable GitHub user ID is required', 403, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const previous = await env.DB.prepare(`SELECT status, requested_at, reviewed_at FROM repository_stewardship_requests
    WHERE oasis_repo_id = ? AND requester_github_user_id = ? ORDER BY requested_at DESC LIMIT 1`)
    .bind(repoId, principal.session.github_user_id).first<{ status: string; requested_at: string; reviewed_at: string | null }>();
  const declinedAt = previous?.reviewed_at ?? previous?.requested_at;
  if (previous?.status === 'declined' && declinedAt && Date.now() - Date.parse(declinedAt) < 24 * 60 * 60 * 1000) {
    return jsonErr('You can submit another request 24 hours after a decline', 429, request);
  }
  const identity = await verifyGitHubUser(env, principal.session.github_login);
  if (!identity || identity.id !== principal.session.github_user_id) return jsonErr('Could not verify your current GitHub identity. Sign in again and retry.', 403, request);
  const steward = await env.DB.prepare('SELECT 1 FROM repository_stewards WHERE oasis_repo_id = ?')
    .bind(repoId).first();
  if (steward) return jsonErr('This repository already has an OASIS Repo Security Steward', 409, request);

  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();
  try {
    await env.DB.prepare(`INSERT INTO repository_stewardship_requests
      (id, oasis_repo_id, requester_github_user_id, requester_login, requester_name, status, requested_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)`)
      .bind(requestId, repoId, principal.session.github_user_id, principal.session.github_login, identity.name ?? null, now).run();
  } catch (error) {
    if (String((error as Error).message).toLowerCase().includes('unique')) {
      return jsonErr('A stewardship request is already awaiting OASIS review for this repository', 409, request);
    }
    throw error;
  }

  await recordPrivilegedAction(env, principal, {
    action: 'repo_stewardship.request', targetType: 'repository', targetId: String(repoId), outcome: 'succeeded',
  });
  return jsonOk({ request: { id: requestId, status: 'pending', requested_at: now } }, request, { cache: 'no-store' });
}

export async function handleReviewStewardshipRequest(
  request: Request, env: Env, repoId: number, requestId: string,
): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to review stewardship requests', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('OASIS administrator role required', 403, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const repo = await repoExists(env, repoId);
  if (!repo) return jsonErr('OASIS repository not found', 404, request);

  let body: { decision?: unknown };
  try { body = await request.json() as { decision?: unknown } }
  catch { return jsonErr('Invalid JSON body', 400, request) }
  if (body.decision !== 'approve' && body.decision !== 'decline') return jsonErr('Decision must be approve or decline', 400, request);
  const row = await env.DB.prepare(`SELECT requester_github_user_id, requester_login, requester_name FROM repository_stewardship_requests
    WHERE id = ? AND oasis_repo_id = ? AND status = 'pending'`).bind(requestId, repoId)
    .first<{ requester_github_user_id: number; requester_login: string; requester_name: string | null }>();
  if (!row) return jsonErr('Pending stewardship request not found', 404, request);
  const now = new Date().toISOString();

  if (body.decision === 'decline') {
    await env.DB.prepare(`UPDATE repository_stewardship_requests SET status = 'declined', reviewed_by_github_user_id = ?,
      reviewed_by_login = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'`)
      .bind(principal.session.github_user_id, principal.session.github_login, now, requestId).run();
  } else {
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO repository_stewards
        (oasis_repo_id, github_user_id, github_login, github_name, assigned_by_github_user_id, assigned_by_login, assigned_at)
        SELECT oasis_repo_id, requester_github_user_id, requester_login, requester_name, ?, ?, ?
          FROM repository_stewardship_requests
         WHERE id = ? AND status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM repository_stewards WHERE oasis_repo_id = ?)`)
        .bind(principal.session.github_user_id, principal.session.github_login, now, requestId, repoId),
      env.DB.prepare(`UPDATE repository_stewardship_requests SET status = 'approved', reviewed_by_github_user_id = ?,
        reviewed_by_login = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'
          AND EXISTS (SELECT 1 FROM repository_stewards s WHERE s.oasis_repo_id = ?
            AND s.github_user_id = repository_stewardship_requests.requester_github_user_id)`)
        .bind(principal.session.github_user_id, principal.session.github_login, now, requestId, repoId),
    ]);
    if (!(results[1]?.meta?.changes ?? 0)) return jsonErr('Another OASIS Repo Security Steward is already assigned', 409, request);
  }

  await recordPrivilegedAction(env, principal, {
    action: `repo_stewardship.${body.decision}`, targetType: 'stewardship_request', targetId: requestId, outcome: 'succeeded',
  });
  const steward = await env.DB.prepare('SELECT github_user_id, github_login, github_name, assigned_at FROM repository_stewards WHERE oasis_repo_id = ?')
    .bind(repoId).first();
  return jsonOk({ decision: body.decision, steward: steward ?? null }, request, { cache: 'no-store' });
}

export async function handleEndRepoStewardship(request: Request, env: Env, repoId: number): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to end repo stewardship', 401, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const steward = await env.DB.prepare('SELECT github_user_id FROM repository_stewards WHERE oasis_repo_id = ?')
    .bind(repoId).first<{ github_user_id: number }>();
  if (!steward) return jsonErr('No OASIS Repo Security Steward is assigned', 404, request);
  const canResign = steward.github_user_id === principal.session.github_user_id;
  const canRemove = roleAllows(principal.role, 'admin');
  if (!canResign && !canRemove) return jsonErr('Only the assigned Steward or an OASIS administrator can end stewardship', 403, request);
  const result = await env.DB.prepare('DELETE FROM repository_stewards WHERE oasis_repo_id = ? AND github_user_id = ?')
    .bind(repoId, steward.github_user_id).run();
  if (!(result.meta?.changes ?? 0)) return jsonErr('Steward assignment changed; refresh and try again', 409, request);
  await recordPrivilegedAction(env, principal, {
    action: canResign ? 'repo_stewardship.resign' : 'repo_stewardship.remove',
    targetType: 'repository', targetId: String(repoId), outcome: 'succeeded',
  });
  return jsonOk({ ended: true, repo_roles_retained: true }, request, { cache: 'no-store' });
}

export async function handleStewardshipInbox(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') return jsonErr('Method not allowed', 405, request);
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in to view stewardship requests', 401, request);
  const isAdmin = roleAllows(principal.role, 'admin');
  const [pending, mine] = await Promise.all([
    isAdmin ? env.DB.prepare(`SELECT sr.id, sr.oasis_repo_id, r.full_name AS repo_full_name,
        sr.requester_github_user_id, sr.requester_login, sr.requester_name, sr.requested_at
      FROM repository_stewardship_requests sr JOIN repos r ON r.id = sr.oasis_repo_id
      WHERE sr.status = 'pending' ORDER BY sr.requested_at ASC`).all<Record<string, unknown>>()
      : Promise.resolve({ results: [] as Record<string, unknown>[] }),
    env.DB.prepare(`SELECT sr.id, sr.oasis_repo_id, r.full_name AS repo_full_name,
        sr.requester_github_user_id, sr.requester_login, sr.requester_name, sr.status,
        sr.requested_at, sr.reviewed_by_login, sr.reviewed_at
      FROM repository_stewardship_requests sr JOIN repos r ON r.id = sr.oasis_repo_id
      WHERE sr.requester_github_user_id = ? ORDER BY sr.requested_at DESC LIMIT 20`)
      .bind(principal.session.github_user_id).all<Record<string, unknown>>(),
  ]);
  return jsonOk({ is_admin: isAdmin, pending: pending.results ?? [], mine: mine.results ?? [] }, request, { cache: 'no-store' });
}

async function verifyGitHubUser(env: Env, login: string): Promise<GitHubUser | null> {
  try {
    const user = await ghFetch<GitHubUser>(`/users/${encodeURIComponent(login)}`, env.GITHUB_TOKEN);
    if (!Number.isSafeInteger(user.id) || !user.login) return null;
    return user;
  } catch { return null; }
}

export async function handleRepoRoleAssignment(request: Request, env: Env, repoId: number, assignmentId?: string): Promise<Response> {
  const access = await requireSteward(request, env, repoId);
  if (access.response) return access.response;
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const { principal } = access;
  const repo = await repoExists(env, repoId);
  if (!repo) return jsonErr('OASIS repository not found', 404, request);
  let body: { action?: unknown; login?: unknown; role_name?: unknown; role_description?: unknown };
  try { body = await request.json() as { action?: unknown; login?: unknown; role_name?: unknown; role_description?: unknown } }
  catch { return jsonErr('Invalid JSON body', 400, request) }

  if (assignmentId && body.action === 'remove') {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`UPDATE repository_role_assignments SET removed_at = ?, removed_by_github_user_id = ?,
      removed_by_login = ?, updated_at = ? WHERE id = ? AND oasis_repo_id = ? AND removed_at IS NULL`)
      .bind(now, principal.session!.github_user_id, principal.session!.github_login, now, assignmentId, repoId).run();
    if (!(result.meta?.changes ?? 0)) return jsonErr('Repo Role assignment not found', 404, request);
    await recordPrivilegedAction(env, principal, { action: 'repo_role.remove', targetType: 'repo_role_assignment', targetId: assignmentId, outcome: 'succeeded' });
    return jsonOk({ removed: true }, request, { cache: 'no-store' });
  }

  const login = String(body.login ?? '').trim().replace(/^@/, '');
  const roleName = String(body.role_name ?? '').trim().replace(/\s+/g, ' ');
  const description = String(body.role_description ?? '').trim();
  if (!/^[a-zA-Z0-9-]{1,39}$/.test(login)) return jsonErr('Enter a valid GitHub username', 400, request);
  if (roleName.length < 2 || roleName.length > 80 || isProtectedRoleName(roleName)) {
    return jsonErr('Use a repo-specific role name. Steward, Maintainer, and generic Member roles are managed separately.', 400, request);
  }
  if (description.length > 500) return jsonErr('Role description must be 500 characters or fewer', 400, request);
  const user = await verifyGitHubUser(env, login);
  if (!user) return jsonErr('GitHub could not verify that account', 422, request);
  const now = new Date().toISOString();

  const savedAssignmentId = assignmentId ?? crypto.randomUUID();
  if (assignmentId) {
    const current = await env.DB.prepare('SELECT id FROM repository_role_assignments WHERE id = ? AND oasis_repo_id = ? AND removed_at IS NULL')
      .bind(assignmentId, repoId).first();
    if (!current) return jsonErr('Repo Role assignment not found', 404, request);
    try {
      await env.DB.prepare(`UPDATE repository_role_assignments SET github_user_id = ?, github_login = ?, github_name = ?, role_name = ?,
        role_description = ?, updated_at = ? WHERE id = ? AND oasis_repo_id = ? AND removed_at IS NULL`)
        .bind(user.id, user.login, user.name ?? null, roleName, description, now, assignmentId, repoId).run();
    } catch (error) {
      if (String((error as Error).message).toLowerCase().includes('unique')) return jsonErr('This person already has that Repo Role', 409, request);
      throw error;
    }
  } else {
    try {
      await env.DB.prepare(`INSERT INTO repository_role_assignments
        (id, oasis_repo_id, github_user_id, github_login, github_name, role_name, role_description, assigned_by_github_user_id,
         assigned_by_login, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(savedAssignmentId, repoId, user.id, user.login, user.name ?? null, roleName, description,
          principal.session!.github_user_id, principal.session!.github_login, now, now).run();
    } catch (error) {
      if (String((error as Error).message).toLowerCase().includes('unique')) return jsonErr('This person already has that Repo Role', 409, request);
      throw error;
    }
  }

  await recordPrivilegedAction(env, principal, {
    action: assignmentId ? 'repo_role.update' : 'repo_role.assign', targetType: 'repo_role_assignment', targetId: savedAssignmentId, outcome: 'succeeded',
  });
  return jsonOk({ updated: Boolean(assignmentId), github_user_id: user.id, github_login: user.login, github_name: user.name ?? null,
    role_name: roleName, role_description: description }, request, { cache: 'no-store' });
}

export async function handleRemoveRegisteredMaintainer(request: Request, env: Env, repoId: number, githubUserId: number): Promise<Response> {
  const access = await requireSteward(request, env, repoId);
  if (access.response) return access.response;
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const result = await env.DB.prepare(`UPDATE verified_upstream_maintainers SET removed_at = ?, updated_at = ?
    WHERE oasis_repo_id = ? AND github_user_id = ? AND removed_at IS NULL`)
    .bind(new Date().toISOString(), new Date().toISOString(), repoId, githubUserId).run();
  if (!(result.meta?.changes ?? 0)) return jsonErr('Registered upstream maintainer not found', 404, request);
  await recordPrivilegedAction(env, access.principal!, { action: 'maintainer.repository_remove', targetType: 'repository_user', targetId: `${repoId}:${githubUserId}`, outcome: 'succeeded' });
  return jsonOk({ removed: true, github_access_changed: false }, request, { cache: 'no-store' });
}
