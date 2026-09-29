import { describe, expect, it } from 'vitest'
import { matchingTeamRepositories } from '../../src/pages/workspace/repositoryMatches'

const repositories = [
  { id: 1, name: 'sample-python-project' },
  { id: 2, name: 'sample-auth-library' },
  { id: 3, name: 'sample-web-framework' },
]

describe('Team repository search', () => {
  it('shows available repositories in name order before typing', () => {
    expect(matchingTeamRepositories(repositories, [], '').map(repo => repo.id)).toEqual([2, 1, 3])
    expect(repositories[0].id).toBe(1)
  })
  it('narrows results as the search is typed, ignoring case and surrounding whitespace', () => {
    expect(matchingTeamRepositories(repositories, [], 'SAMPLE')).toHaveLength(3)
    expect(matchingTeamRepositories(repositories, [], '  Sample-Py ').map(repo => repo.id)).toEqual([1])
  })
  it('immediately excludes repositories already added to focus', () => {
    expect(matchingTeamRepositories(repositories, [repositories[0]], 'python')).toEqual([])
    expect(matchingTeamRepositories(repositories, repositories, '')).toEqual([])
  })
  it('returns no matches for unknown names or an empty catalog', () => {
    expect(matchingTeamRepositories(repositories, [], 'missing')).toEqual([])
    expect(matchingTeamRepositories([], [], '')).toEqual([])
  })
})
