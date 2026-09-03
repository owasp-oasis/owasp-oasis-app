/**
 * Stale PR cleanup task.
 * Checks all PRs against GitHub's API to find deleted PRs and mark them as soft-deleted.
 * Repository inventory reconciliation helpers. PR-by-PR orphan cleanup is
 * implemented as request-bounded Workflow chunks in orphanCleanupWorkflow.ts.
 */

import type { Env } from './types.js';
import { ghFetchAll, META_REPOS, ORG, type GitHubRepo } from './github.js';

export interface RepositoryReconciliationResult {
  checked: number;
  removed: number;
  flagged: number;
  errors: number;
  repositories: Array<{ repo_id: number; repo: string; prs_flagged: number }>;
}

export interface PullRequestInventoryResult {
  checked: number;
  flagged: number;
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
 * Reconciles one repository from a complete, successfully fetched GitHub PR
 * inventory. GitHub PR IDs are immutable and globally unique, so repository
 * names and PR numbers are never used as identity for this comparison.
 */
export async function reconcileRepositoryPullRequests(
  db: D1Database,
  repoId: number,
  currentPullRequestIds: number[],
): Promise<PullRequestInventoryResult> {
  const rows = await db.prepare(
    'SELECT id FROM pull_requests WHERE repo_id = ? AND deleted = 0 ORDER BY id',
  ).bind(repoId).all<{ id: number }>();
  const currentIds = new Set(currentPullRequestIds);
  const staleIds = (rows.results ?? [])
    .map(row => row.id)
    .filter(id => !currentIds.has(id));

  if (staleIds.length > 0) {
    const deletedAt = new Date().toISOString();
    await db.batch(staleIds.map(id => db.prepare(
      'UPDATE pull_requests SET deleted = 1, deleted_at = ? WHERE id = ? AND repo_id = ? AND deleted = 0',
    ).bind(deletedAt, id, repoId)));
  }

  return { checked: rows.results?.length ?? 0, flagged: staleIds.length };
}
