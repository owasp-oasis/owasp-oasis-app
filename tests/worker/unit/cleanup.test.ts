import { describe, expect, it } from 'vitest';
import { findRemovedRepositoryNames } from '../../../worker/cleanup.js';

describe('findRemovedRepositoryNames', () => {
  it('finds repos-table entries absent from the validated public-fork inventory', () => {
    const publicRepos = [
      { name: 'current-fork', fork: true },
      { name: 'org-owned-repo', fork: false },
    ];

    expect(findRemovedRepositoryNames(publicRepos, [
      'stale-with-active-prs',
      'current-fork',
      'stale-with-no-prs',
    ])).toEqual(['stale-with-active-prs', 'stale-with-no-prs']);
  });

  it('refuses to classify repos when GitHub returns no public forks', () => {
    expect(findRemovedRepositoryNames([], ['tracked-repo'])).toEqual([]);
    expect(findRemovedRepositoryNames(
      [{ name: 'org-owned-repo', fork: false }],
      ['tracked-repo'],
    )).toEqual([]);
  });
});
