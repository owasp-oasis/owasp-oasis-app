import { describe, expect, it } from 'vitest';
import { findRemovedRepositoryIds } from '../../../worker/cleanup.js';

describe('findRemovedRepositoryIds', () => {
  it('finds repos-table entries absent from the validated public-fork inventory', () => {
    const publicRepos = [
      { id: 202, name: 'reused-name', fork: true },
      { id: 404, name: 'org-owned-repo', fork: false },
    ];

    expect(findRemovedRepositoryIds(publicRepos, [303, 202, 101])).toEqual([101, 303]);
  });

  it('refuses to classify repos when GitHub returns no public forks', () => {
    expect(findRemovedRepositoryIds([], [101])).toEqual([]);
    expect(findRemovedRepositoryIds(
      [{ id: 404, name: 'org-owned-repo', fork: false }],
      [101],
    )).toEqual([]);
  });
});
