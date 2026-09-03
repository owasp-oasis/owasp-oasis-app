import { getRequestPrincipal, roleAllows } from '../authorization.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';
import type { Env } from '../types.js';
import { parseBody, vGitHub } from '../validation.js';
import type { UserRole } from './auth.js';

const PAGE_SIZE = 50;

interface RegistrationRow {
  id: number;
  name: string;
  email: string;
  github: string;
  registration_role: string;
  created_at: string;
  github_user_id: number | null;
  access_role: UserRole | null;
}

interface RegistrationIdentity {
  id: number;
  github: string;
}

interface GitHubProfile {
  id: number;
  login: string;
}

interface ExistingRoleIdentity {
  github_user_id: number;
}

function isUserRole(value: unknown): value is UserRole {
  return value === 'admin'
    || value === 'moderator'
    || value === 'member'
    || value === 'guest';
}

async function resolveGitHubProfile(
  request: Request,
  login: string,
  token: string,
): Promise<GitHubProfile | Response> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'oasis-worker-role-management/1.0',
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    console.error(JSON.stringify({ event: 'admin_role_github_lookup_failed', reason: 'request_error' }));
    return jsonErr('Could not verify the GitHub account right now. Please try again.', 503, request);
  }

  if (response.status === 404) {
    return jsonErr('The registered GitHub account no longer exists.', 400, request);
  }
  if (!response.ok) {
    console.error(JSON.stringify({
      event: 'admin_role_github_lookup_failed',
      reason: 'github_response',
      status: response.status,
    }));
    return jsonErr('Could not verify the GitHub account right now. Please try again.', 503, request);
  }

  let profile: unknown;
  try {
    profile = await response.json();
  } catch {
    return jsonErr('GitHub returned an invalid account response.', 503, request);
  }

  if (typeof profile !== 'object' || profile === null) {
    return jsonErr('GitHub returned an invalid account response.', 503, request);
  }

  const id = 'id' in profile ? profile.id : null;
  const canonicalLogin = 'login' in profile ? profile.login : null;
  const accountType = 'type' in profile ? profile.type : null;
  if (
    typeof id !== 'number'
    || !Number.isSafeInteger(id)
    || id <= 0
    || typeof canonicalLogin !== 'string'
    || !canonicalLogin
    || accountType !== 'User'
  ) {
    return jsonErr('The registered GitHub identity is not a valid user account.', 400, request);
  }

  return { id, login: canonicalLogin };
}

export async function handleAdminUsers(request: Request, env: Env): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required', 403, request);

  const url = new URL(request.url);
  const rawPage = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const pattern = `%${query}%`;
  const offset = (page - 1) * PAGE_SIZE;

  const where = query
    ? 'WHERE r.name LIKE ? OR r.email LIKE ? OR r.github LIKE ?'
    : '';
  const listStatement = env.DB.prepare(`
    SELECT
      r.id,
      r.name,
      r.email,
      COALESCE(r.github, '') AS github,
      COALESCE(r.role, '') AS registration_role,
      r.created_at,
      ur.github_user_id,
      CASE
        WHEN COALESCE(r.github, '') = '' THEN NULL
        ELSE COALESCE(ur.role, 'member')
      END AS access_role
    FROM registrations r
    LEFT JOIN user_roles ur ON ur.github_login = r.github COLLATE NOCASE
    ${where}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ? OFFSET ?
  `);
  const countStatement = env.DB.prepare(`
    SELECT COUNT(*) AS count FROM registrations r ${where}
  `);

  const listBindings = query
    ? [pattern, pattern, pattern, PAGE_SIZE, offset]
    : [PAGE_SIZE, offset];
  const countBindings = query ? [pattern, pattern, pattern] : [];

  try {
    const [rows, countRow] = await Promise.all([
      listStatement.bind(...listBindings).all<RegistrationRow>(),
      countStatement.bind(...countBindings).first<{ count: number }>(),
    ]);
    const total = countRow?.count ?? 0;
    const users = (rows.results ?? []).map(user => {
      const isSelf = user.github_user_id === principal.session?.github_user_id
        || user.github.toLowerCase() === principal.session?.github_login.toLowerCase();
      return {
        ...user,
        is_self: isSelf,
        can_assign_role: !isSelf,
      };
    });
    return jsonOk({
      users,
      pagination: {
        page,
        page_size: PAGE_SIZE,
        total,
        total_pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      },
    }, request, { cache: 'no-store' });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'admin_user_list_failed',
      error: error instanceof Error ? error.message : 'unknown_error',
    }));
    return jsonErr('Failed to load registered users.', 500, request);
  }
}

export async function handleAdminUserRole(
  request: Request,
  env: Env,
  registrationId: number,
): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Authentication required', 401, request);
  if (!roleAllows(principal.role, 'admin')) return jsonErr('Admin role required', 403, request);
  if (!validateCSRF(request)) return jsonErr('Invalid security token', 403, request);
  if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
    return jsonErr('Invalid registration ID', 400, request);
  }

  const parsed = await parseBody(request);
  if (!parsed.ok) return jsonErr(parsed.error, parsed.status ?? 400, request);
  const role = parsed.val.role;
  if (!isUserRole(role)) return jsonErr('Invalid access role', 400, request);

  const registration = await env.DB.prepare(`
    SELECT id, COALESCE(github, '') AS github
    FROM registrations
    WHERE id = ?
  `).bind(registrationId).first<RegistrationIdentity>();
  if (!registration) return jsonErr('Registered user not found', 404, request);
  if (registration.github.toLowerCase() === principal.session.github_login.toLowerCase()) {
    return jsonErr('You cannot change your own access role.', 409, request);
  }

  const submittedGitHub = parsed.val.github === undefined
    ? registration.github
    : parsed.val.github;
  const github = vGitHub(submittedGitHub);
  if (!github.ok) return jsonErr(github.error, 400, request);
  if (!github.val) {
    return jsonErr('This registration does not include a GitHub username.', 409, request);
  }
  if (
    registration.github
    && github.val.toLowerCase() !== registration.github.toLowerCase()
  ) {
    return jsonErr('An existing GitHub identity cannot be replaced while assigning a role.', 409, request);
  }

  const profile = await resolveGitHubProfile(request, github.val, env.GITHUB_TOKEN);
  if (profile instanceof Response) return profile;

  if (
    profile.id === principal.session.github_user_id
    || profile.login.toLowerCase() === principal.session.github_login.toLowerCase()
  ) {
    return jsonErr('You cannot change your own access role.', 409, request);
  }

  const loginOwner = await env.DB.prepare(`
    SELECT github_user_id FROM user_roles WHERE github_login = ? COLLATE NOCASE
  `).bind(profile.login).first<ExistingRoleIdentity>();
  if (loginOwner && loginOwner.github_user_id !== profile.id) {
    return jsonErr(
      'This GitHub username conflicts with a different stored account identity. Resolve the identity before assigning a role.',
      409,
      request,
    );
  }

  const now = new Date().toISOString();
  const auditId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO user_roles (
          github_user_id, github_login, role, assigned_by_github_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(github_user_id) DO UPDATE SET
          github_login = excluded.github_login,
          role = excluded.role,
          assigned_by_github_user_id = excluded.assigned_by_github_user_id,
          updated_at = excluded.updated_at
      `).bind(
        profile.id,
        profile.login,
        role,
        principal.session.github_user_id,
        now,
        now,
      ),
      env.DB.prepare('UPDATE registrations SET github = ?, updated_at = ? WHERE id = ?')
        .bind(profile.login, now, registration.id),
      env.DB.prepare(`
        INSERT INTO privileged_action_audit (
          id, github_user_id, github_login, role, action,
          target_type, target_id, outcome, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        auditId,
        principal.session.github_user_id,
        principal.session.github_login,
        principal.role,
        'user_role.assign',
        'github_user',
        String(profile.id),
        'succeeded',
        now,
      ),
    ]);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'admin_role_assignment_failed',
      error: error instanceof Error ? error.message : 'unknown_error',
    }));
    return jsonErr('Failed to update the access role.', 500, request);
  }

  return jsonOk({
    user: {
      registration_id: registration.id,
      github: profile.login,
      github_user_id: profile.id,
      access_role: role,
    },
  }, request, { cache: 'no-store' });
}
