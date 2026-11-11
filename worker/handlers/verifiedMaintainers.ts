import type { Env } from '../types.js';
import { getRequestPrincipal, recordPrivilegedAction } from '../authorization.js';
import { ghFetch, parseGitHubUrl } from '../github.js';
import { jsonErr, jsonOk, validateCSRF } from '../security.js';

interface GitHubRepository {
  id: number;
  full_name: string;
  permissions?: { admin?: boolean; maintain?: boolean };
}

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
}

interface OASISRepo {
  id: number;
  name: string;
  full_name: string;
  upstream_url: string | null;
}

function repoPath(upstreamUrl: string): string | null {
  const parsed = parseGitHubUrl(upstreamUrl);
  return parsed ? `/repos/${parsed.owner}/${parsed.repo}` : null;
}

export async function handleVerifiedMaintainers(request: Request, env: Env): Promise<Response> {
  const principal = await getRequestPrincipal(request, env);
  if (!principal.session) return jsonErr('Sign in with GitHub to connect a repository', 401, request);

  if (request.method === 'GET') {
    const rows = await env.DB.prepare(`
      SELECT vm.oasis_repo_id, r.full_name AS oasis_fork, vm.upstream_repo_github_id,
             vm.upstream_full_name, vm.github_login, vm.github_name, vm.github_permission, vm.verified_at
        FROM verified_upstream_maintainers vm
        JOIN repos r ON r.id = vm.oasis_repo_id
       WHERE vm.github_user_id = ? AND vm.removed_at IS NULL
       ORDER BY vm.updated_at DESC, vm.id DESC
    `).bind(principal.session.github_user_id).all();
    return jsonOk({ repositories: rows.results ?? [] }, request, { cache: 'no-store' });
  }

  if (request.method !== 'POST') return jsonErr('Method not allowed', 405, request);
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  if (!principal.session.github_user_id) return jsonErr('A GitHub account with an immutable user ID is required', 403, request);
  if (!principal.session.github_token) return jsonErr('Sign in again to verify GitHub repository access', 403, request);

  let body: { oasis_repo_id?: unknown };
  try {
    body = await request.json() as { oasis_repo_id?: unknown };
  } catch {
    return jsonErr('Invalid JSON body', 400, request);
  }
  const oasisRepoId = Number(body.oasis_repo_id);
  if (!Number.isSafeInteger(oasisRepoId) || oasisRepoId <= 0) return jsonErr('A valid OASIS repository is required', 400, request);

  const oasisRepo = await env.DB.prepare(`
    SELECT id, name, full_name, upstream_url FROM repos WHERE id = ? AND active = 1
  `).bind(oasisRepoId).first<OASISRepo>();
  if (!oasisRepo) return jsonErr('OASIS repository not found', 404, request);
  if (!oasisRepo.upstream_url) return jsonErr('This OASIS fork has no upstream repository configured', 409, request);
  const path = repoPath(oasisRepo.upstream_url);
  if (!path) return jsonErr('The configured upstream repository URL is invalid', 409, request);

  let upstream: GitHubRepository;
  try {
    upstream = await ghFetch<GitHubRepository>(path, principal.session.github_token);
  } catch {
    return jsonErr('GitHub could not verify your access to the upstream repository', 502, request);
  }
  if (!Number.isSafeInteger(upstream.id) || !upstream.full_name) return jsonErr('GitHub returned incomplete repository identity', 502, request);
  const permission = upstream.permissions?.admin ? 'admin' : upstream.permissions?.maintain ? 'maintain' : null;
  if (!permission) return jsonErr('Maintain or Admin access to the upstream repository is required', 403, request);

  let githubUser: GitHubUser;
  try {
    githubUser = await ghFetch<GitHubUser>('/user', principal.session.github_token);
  } catch {
    return jsonErr('GitHub could not verify the signed-in account', 502, request);
  }
  if (githubUser.id !== principal.session.github_user_id || githubUser.login.toLowerCase() !== principal.session.github_login.toLowerCase()) {
    return jsonErr('The GitHub account in this session could not be verified', 403, request);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO verified_upstream_maintainers (
      oasis_repo_id, upstream_repo_github_id, upstream_full_name, github_user_id,
      github_login, github_name, github_permission, verified_at, removed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(oasis_repo_id, github_user_id) DO UPDATE SET
      upstream_repo_github_id = excluded.upstream_repo_github_id,
      upstream_full_name = excluded.upstream_full_name,
      github_login = excluded.github_login,
      github_name = excluded.github_name,
      github_permission = excluded.github_permission,
      verified_at = excluded.verified_at,
      removed_at = NULL,
      updated_at = excluded.updated_at
  `).bind(
    oasisRepo.id, upstream.id, upstream.full_name, principal.session.github_user_id,
    principal.session.github_login, githubUser.name ?? null, permission, now, now, now,
  ).run();

  await recordPrivilegedAction(env, principal, {
    action: 'maintainer.repository_connect', targetType: 'repository',
    targetId: String(oasisRepo.id), outcome: 'succeeded',
  });
  return jsonOk({
    repository: {
      oasis_repo_id: oasisRepo.id,
      oasis_fork: oasisRepo.full_name,
      upstream_repo_github_id: upstream.id,
      upstream_full_name: upstream.full_name,
      github_login: principal.session.github_login,
      github_name: githubUser.name ?? null,
      github_permission: permission,
      verified_at: now,
    },
  }, request, { cache: 'no-store' });
}
