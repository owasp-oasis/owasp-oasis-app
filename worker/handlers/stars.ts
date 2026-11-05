/**
 * Repository star prompt: lets a signed-in user star the OASIS repositories
 * from inside the app with one explicit click.
 *
 *   GET  /api/github/stars → { ok, repos: [{ full_name, starred }], all_starred }
 *   POST /api/github/stars → stars every listed repository the user has not starred yet
 *
 * Both routes act only with the user's own OAuth token and only on the fixed
 * server-side list below. The client cannot choose which repositories are
 * starred. POST must only be called from a visible button the user clicked;
 * never call it automatically (GitHub prohibits inauthentic stars).
 */

import type { Env } from '../types.js';
import { getSession } from './auth.js';
import { jsonErr, jsonOk, secHeaders, validateCSRF } from '../security.js';

export const STAR_REPOS = ['OWASP/oasis', 'owasp-oasis/project-overview'] as const;

const GH_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'oasis-worker-stars/1.0',
  'X-GitHub-Api-Version': '2022-11-28',
};

type StarState = { full_name: string; starred: boolean };

async function isStarred(token: string, repo: string): Promise<boolean | null> {
  const res = await fetch(`https://api.github.com/user/starred/${repo}`, {
    headers: { ...GH_HEADERS, Authorization: `Bearer ${token}` },
  });
  if (res.status === 204) return true;
  if (res.status === 404) return false;
  return null; // unknown: expired token, rate limit, GitHub outage
}

async function readStates(token: string): Promise<StarState[] | null> {
  const results = await Promise.all(STAR_REPOS.map(repo => isStarred(token, repo)));
  if (results.some(r => r === null)) return null;
  return STAR_REPOS.map((full_name, i) => ({ full_name, starred: results[i] === true }));
}

function summary(repos: StarState[], request: Request): Response {
  return jsonOk({ repos, all_starred: repos.every(r => r.starred) }, request, { cache: 'no-store' });
}

/* ─── GET /api/github/stars ──────────────────────────────────── */
export async function handleStarStatus(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  if (!session) return jsonErr('Sign in to check stars', 401, request);
  if (!session.github_token) return jsonErr('Forbidden — you may need to re-authenticate', 403, request);

  const repos = await readStates(session.github_token).catch(() => null);
  if (!repos) return jsonErr('Could not check star status on GitHub', 502, request);
  return summary(repos, request);
}

/* ─── POST /api/github/stars ─────────────────────────────────── */
export async function handleStarRepos(request: Request, env: Env): Promise<Response> {
  if (!validateCSRF(request)) return jsonErr('Invalid or missing security token', 403, request);
  const session = await getSession(request, env);
  if (!session) return jsonErr('Sign in to star repositories', 401, request);
  if (!session.github_token) return jsonErr('Forbidden — you may need to re-authenticate', 403, request);
  const token = session.github_token;

  let current: StarState[] | null;
  try {
    current = await readStates(token);
  } catch {
    current = null;
  }
  if (!current) return jsonErr('Could not check star status on GitHub', 502, request);

  const repos = await Promise.all(current.map(async (state): Promise<StarState> => {
    if (state.starred) return state;
    try {
      const res = await fetch(`https://api.github.com/user/starred/${state.full_name}`, {
        method: 'PUT',
        headers: { ...GH_HEADERS, Authorization: `Bearer ${token}`, 'Content-Length': '0' },
      });
      return { full_name: state.full_name, starred: res.status === 204 };
    } catch {
      return state;
    }
  }));

  if (!repos.every(r => r.starred)) {
    const failed = repos.filter(r => !r.starred).map(r => r.full_name).join(', ');
    console.error('[stars] star failed for', failed);
    return secHeaders(Response.json(
      { ok: false, error: `GitHub did not accept the star for ${failed}. Try again or star it on GitHub.`, repos, all_starred: false },
      { status: 502 },
    ), request);
  }
  return summary(repos, request);
}
