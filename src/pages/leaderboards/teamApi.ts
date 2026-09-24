export type TeamRole = 'owner' | 'admin' | 'member'
export type MembershipMode = 'invite_only' | 'request'
export type TeamLogoKey = 'initials' | 'shield' | 'bug' | 'lock' | 'spark' | 'code' | 'leaf'
export type TeamBadgeKey = 'membership' | 'contributor_milestone'
export const teamBadgeThresholds = [3, 5, 10, 25] as const
export interface TeamLogoOption { key: TeamLogoKey; label: string; mark: string }
export const teamLogoOptions: TeamLogoOption[] = [
  { key: 'initials', label: 'Initials', mark: 'Aa' },
  { key: 'shield', label: 'Shield', mark: '◇' },
  { key: 'bug', label: 'Bug', mark: '✣' },
  { key: 'lock', label: 'Lock', mark: '▣' },
  { key: 'spark', label: 'Spark', mark: '✦' },
  { key: 'code', label: 'Code', mark: '</>' },
  { key: 'leaf', label: 'Leaf', mark: '⌁' },
]
export function teamLogoMark(key: string | null | undefined): string | null {
  return teamLogoOptions.find(option => option.key === key && key !== 'initials')?.mark ?? null
}
export interface Team {
  id: number
  name: string
  description: string
  logo_key: TeamLogoKey
  logo_image_data?: string | null
  banner_image_data?: string | null
  membership_mode: MembershipMode
  status: 'active' | 'archived' | 'suspended'
  member_count: number
  attributed_validations: number
  accepted_outcome_reviews: number
}
export interface MyTeam extends Omit<Team, 'member_count' | 'attributed_validations' | 'accepted_outcome_reviews'> { role: TeamRole }
export interface TeamOffer { id: number; team_id: number; team_name: string }
export interface MyTeams {
  teams: MyTeam[]
  invites: TeamOffer[]
  join_requests: TeamOffer[]
  ownership_transfers: TeamOffer[]
}
export interface TeamBadge {
  id: number
  team_id: number
  github_login: string
  badge_key: TeamBadgeKey
  qualifying_count: number
  threshold: number | null
  awarded_at: string
}
export interface TeamBadgeSettings { contribution_threshold: number; public_display: number; updated_at: string }
export const emptyMyTeams: MyTeams = { teams: [], invites: [], join_requests: [], ownership_transfers: [] }
export async function teamGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', signal })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Could not load Teams. Please try again.')
  return result as T
}
export async function teamPost<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const { token } = await teamGet<{ token: string }>('/api/csrf')
  const response = await fetch(path, {
    method: 'POST', credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Could not save this change. Please try again.')
  return result as T
}
export async function teamPut<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const { token } = await teamGet<{ token: string }>('/api/csrf')
  const response = await fetch(path, {
    method: 'PUT', credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Could not save this preference. Please try again.')
  return result as T
}
export async function teamUpload<T = unknown>(path: string, file: File | null, kind: 'logo' | 'banner', remove = false): Promise<T> {
  const { token } = await teamGet<{ token: string }>('/api/csrf')
  const form = new FormData()
  form.set('kind', kind)
  if (file) form.set('file', file)
  if (remove) form.set('remove', 'true')
  const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': token }, body: form })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Could not upload this image. Please try again.')
  return result as T
}
export function teamInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
}

// A failed optional upload must not turn a successful creation into a retry
// of POST /teams. Return the new team so the user can recover in its settings.
export async function createTeamWithLogo(input: Record<string, unknown>, logo: File | null): Promise<{ team: Team; logoError?: string }> {
  const result = await teamPost<{ team: Team }>('/api/teams', input)
  if (!result.team?.id) throw new Error('The Team was not returned. Refresh Your teams before trying again.')
  if (!logo) return result
  try {
    return await teamUpload<{ team: Team }>('/api/teams/' + result.team.id + '/media', logo, 'logo')
  } catch (caught) {
    return { team: result.team, logoError: errorMessage(caught) }
  }
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
