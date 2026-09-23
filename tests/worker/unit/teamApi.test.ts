import { afterEach, describe, expect, it, vi } from 'vitest'
import { teamGet, teamPost, teamInitials } from '../../../src/pages/leaderboards/teamApi'

afterEach(() => vi.unstubAllGlobals())

describe('Teams browser API boundary', () => {
  it('reloads membership without using a stale browser cache', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ teams: [{ id: 3 }] }))
    vi.stubGlobal('fetch', fetcher)
    expect(await teamGet('/api/teams/mine')).toEqual({ teams: [{ id: 3 }] })
    expect(fetcher).toHaveBeenCalledWith('/api/teams/mine', expect.objectContaining({ credentials: 'include', cache: 'no-store' }))
  })

  it('fetches CSRF before saving and returns the created team for navigation', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'test-csrf' }))
      .mockResolvedValueOnce(Response.json({ team: { id: 42 } }, { status: 201 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await teamPost('/api/teams', { name: 'Reviewers' })).toEqual({ team: { id: 42 } })
    expect(fetcher).toHaveBeenNthCalledWith(2, '/api/teams', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'test-csrf' },
      body: JSON.stringify({ name: 'Reviewers' }),
    }))
  })

  it('does not attempt a mutation when CSRF acquisition fails', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'Session expired' }, { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(teamPost('/api/teams', { name: 'Reviewers' })).rejects.toThrow('Session expired')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('reports save rejection instead of treating it as success', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'test-csrf' }))
      .mockResolvedValueOnce(Response.json({ error: 'Owner access required' }, { status: 403 })))
    await expect(teamPost('/api/teams/1/members', { action: 'set_admin' })).rejects.toThrow('Owner access required')
  })

  it('provides readable initials for empty and multiword names', () => {
    expect(teamInitials('')).toBe('')
    expect(teamInitials('  Python   security reviewers ')).toBe('PS')
    expect(teamInitials('OASIS')).toBe('O')
  })
})
