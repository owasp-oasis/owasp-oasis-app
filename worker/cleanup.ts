/**
 * Stale PR cleanup task.
 * Checks all PRs against GitHub's API to find deleted PRs and mark them as soft-deleted.
 * Runs as part of the scheduled cron (after sync completes) or via manual admin endpoint.
 */

import type { Env } from './types.js';
import { ghFetchAll, META_REPOS, ORG, type GitHubRepo } from './github.js';

interface CleanupResult {
  checked: number;
  flagged: number;
  errors: number;
  deletedPRs: Array<{ repo: string; number: number; id: number }>;
}

interface RepositoryReconciliationResult {
  checked: number;
  removed: number;
  flagged: number;
  errors: number;
  repositories: Array<{ repo_id: number; repo: string; prs_flagged: number }>;
}

/**
 * Finds tracked repositories that are absent from a complete public fork listing.
 * Kept pure so the safety-critical set comparison can be tested independently.
 */
export function findRemovedRepositoryIds(
  publicRepos: Array<Pick<GitHubRepo, 'id' | 'name' | 'fork'>>,
  trackedIds: number[],
): number[] {
  const currentIds = new Set(
    publicRepos
      .filter(repo => repo.fork && !META_REPOS.has(repo.name))
      .map(repo => repo.id),
  );

  if (currentIds.size === 0) return [];
  return trackedIds.filter(id => !currentIds.has(id)).sort((a, b) => a - b);
}

/**
 * Reconciles D1 against GitHub's complete public repository listing.
 *
 * This is deliberately safer than treating a repository-level 404 as proof of
 * deletion: ghFetchAll must first return a valid, non-empty, fully paginated
 * organization listing. If GitHub authentication, pagination, or transport
 * fails, no records are changed.
 */
export async function reconcileRemovedRepositories(env: Env): Promise<RepositoryReconciliationResult> {
  const result: RepositoryReconciliationResult = {
    checked: 0,
    removed: 0,
    flagged: 0,
    errors: 0,
    repositories: [],
  };

  if (!env.DB) {
    console.warn('Repository reconciliation: DB not available, skipping');
    return result;
  }

  try {
    const publicRepos = await ghFetchAll<GitHubRepo>(`/orgs/${ORG}/repos?type=public`, env.GITHUB_TOKEN);
    const currentForkCount = publicRepos.filter(repo => repo.fork && !META_REPOS.has(repo.name)).length;
    if (currentForkCount === 0) {
      console.warn('Repository reconciliation: GitHub returned no public forks; refusing to modify D1');
      result.errors++;
      return result;
    }

    const trackedRows = await env.DB.prepare(
      'SELECT id, name FROM repos WHERE active = 1 ORDER BY id',
    ).all<{ id: number; name: string }>();
    const trackedRepos = trackedRows.results ?? [];
    const removedIds = new Set(findRemovedRepositoryIds(
      publicRepos,
      trackedRepos.map(repo => repo.id),
    ));
    const removedRepos = trackedRepos.filter(repo => removedIds.has(repo.id));
    result.checked = trackedRepos.length;

    for (const repo of removedRepos) {
      try {
        const [prDeletion] = await env.DB.batch([
          env.DB.prepare(
            'UPDATE pull_requests SET deleted = 1, deleted_at = ? WHERE repo_id = ? AND deleted = 0',
          ).bind(new Date().toISOString(), repo.id),
          env.DB.prepare('UPDATE repos SET active = 0 WHERE id = ?').bind(repo.id),
        ]);
        const flagged = prDeletion.meta.changes ?? 0;

        result.removed++;
        result.flagged += flagged;
        result.repositories.push({ repo_id: repo.id, repo: repo.name, prs_flagged: flagged });
        console.log(`Repository reconciliation: marked ${repo.name} (${repo.id}) inactive; flagged ${flagged} PR(s)`);
      } catch (err) {
        result.errors++;
        console.error(
          `Repository reconciliation: failed to deactivate ${repo.name} (${repo.id}):`,
          (err as Error)?.message,
        );
      }
    }
  } catch (err) {
    result.errors++;
    console.error('Repository reconciliation failed:', (err as Error)?.message);
  }

  return result;
}

/**
 * Runs the cleanup task: checks all non-deleted PRs against GitHub API.
 * For each PR that returns 404 or 410, flags it as deleted.
 * Returns a summary of how many were checked, flagged, and failed.
 */
export async function runCleanup(env: Env): Promise<CleanupResult> {
  if (!env.DB) {
    console.warn('Cleanup: DB not available, skipping');
    return { checked: 0, flagged: 0, errors: 0, deletedPRs: [] };
  }

  const result: CleanupResult = {
    checked: 0,
    flagged: 0,
    errors: 0,
    deletedPRs: [],
  };

  try {
    // Resolve current repository names through immutable repository IDs. Names
    // are used only because GitHub's REST paths are name-addressed.
    const prsRows = await env.DB.prepare(
      `SELECT p.id, r.name AS repo_name, p.number
         FROM pull_requests p JOIN repos r ON r.id = p.repo_id
        WHERE p.deleted = 0 AND r.active = 1
        ORDER BY p.id DESC`,
    ).all<{ id: number; repo_name: string; number: number }>();

    const prs = prsRows.results ?? [];
    console.log(`Cleanup: checking ${prs.length} non-deleted PRs...`);

    // Check each PR against GitHub API
    for (const pr of prs) {
      result.checked++;

      try {
        // GET /repos/owasp-oasis/{repo}/pulls/{number}
        const path = `/repos/owasp-oasis/${pr.repo_name}/pulls/${pr.number}`;
        const response = await fetch(`https://api.github.com${path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'oasis-cleanup/1.0',
          },
        });

        // 404 or 410 = PR no longer exists
        if (response.status === 404 || response.status === 410) {
          const now = new Date().toISOString();
          await env.DB.prepare(
            'UPDATE pull_requests SET deleted = 1, deleted_at = ? WHERE id = ?',
          ).bind(now, pr.id).run();

          result.flagged++;
          result.deletedPRs.push({
            repo: pr.repo_name,
            number: pr.number,
            id: pr.id,
          });
          console.log(`  [DELETED] ${pr.repo_name}#${pr.number} (id=${pr.id})`);
        } else if (!response.ok) {
          result.errors++;
          console.warn(`  [ERROR] ${pr.repo_name}#${pr.number}: HTTP ${response.status}`);
        }
        // else: 200 OK, PR still exists, skip
      } catch (err) {
        result.errors++;
        console.error(
          `  [ERROR] ${pr.repo_name}#${pr.number}:`,
          (err as Error)?.message,
        );
      }
    }

    console.log(
      `Cleanup complete: checked=${result.checked}, flagged=${result.flagged}, errors=${result.errors}`,
    );
  } catch (err) {
    console.error('Cleanup fatal error:', (err as Error)?.message);
  }

  return result;
}
