/**
 * Stale PR cleanup task.
 * Checks all PRs against GitHub's API to find deleted PRs and mark them as soft-deleted.
 * Runs as part of the scheduled cron (after sync completes) or via manual admin endpoint.
 */

import type { Env } from './types.js';

interface CleanupResult {
  checked: number;
  flagged: number;
  errors: number;
  deletedPRs: Array<{ repo: string; number: number; id: number }>;
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
    // Query all non-deleted PRs: (id, repo_name, number)
    const prsRows = await env.DB.prepare(
      'SELECT id, repo_name, number FROM pull_requests WHERE deleted = 0 ORDER BY id DESC',
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
