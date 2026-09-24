import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTeamWithLogo, teamGet, teamPost, teamInitials, teamLogoMark } from '../../../src/pages/leaderboards/teamApi'

afterEach(() => vi.unstubAllGlobals())

describe('Teams browser API boundary', () => {
  it('uploads the selected logo only after team creation succeeds', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'create-csrf' }))
      .mockResolvedValueOnce(Response.json({ team: { id: 42 } }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ token: 'media-csrf' }))
      .mockResolvedValueOnce(Response.json({ team: { id: 42, logo_image_data: 'data:image/png;base64,test' } }))
    vi.stubGlobal('fetch', fetcher)
    const logo = new File(['image'], 'logo.png', { type: 'image/png' })
    const result = await createTeamWithLogo({ name: 'Reviewers' }, logo)
    expect(result.team.logo_image_data).toBe('data:image/png;base64,test')
    const [url, options] = fetcher.mock.calls[3]
    expect(url).toBe('/api/teams/42/media')
    expect(options.headers['x-csrf-token']).toBe('media-csrf')
    expect(options.body.get('kind')).toBe('logo')
    expect(options.body.get('file').name).toBe('logo.png')
  })

  it('retains the created team when its optional upload fails, without creating a duplicate', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'create-csrf' }))
      .mockResolvedValueOnce(Response.json({ team: { id: 42 } }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ token: 'media-csrf' }))
      .mockResolvedValueOnce(Response.json({ error: 'The uploaded file is not a valid image' }, { status: 400 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await createTeamWithLogo({ name: 'Reviewers' }, new File(['bad'], 'bad.png', { type: 'image/png' })))
      .toEqual({ team: { id: 42 }, logoError: 'The uploaded file is not a valid image' })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/teams')).toHaveLength(1)
  })

  it('does not upload when creation fails or no custom logo is selected', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ token: 'csrf' }))
      .mockResolvedValueOnce(Response.json({ error: 'Name already exists' }, { status: 409 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(createTeamWithLogo({ name: 'Reviewers' }, new File(['image'], 'logo.png'))).rejects.toThrow('Name already exists')
    expect(fetcher).toHaveBeenCalledTimes(2)
    fetcher.mockReset()
      .mockResolvedValueOnce(Response.json({ token: 'csrf' }))
      .mockResolvedValueOnce(Response.json({ team: { id: 43 } }, { status: 201 }))
    expect(await createTeamWithLogo({ name: 'Reviewers' }, null)).toEqual({ team: { id: 43 } })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

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

  it('uses a built-in mark while retaining initials as the fallback', () => {
    expect(teamLogoMark('shield')).toBe('◇')
    expect(teamLogoMark('initials')).toBeNull()
    expect(teamLogoMark('unknown')).toBeNull()
  })
})
