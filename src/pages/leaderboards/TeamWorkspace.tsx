import { useEffect, useState, type FormEvent } from 'react'

type Role = 'owner' | 'admin' | 'member'
type MembershipMode = 'invite_only' | 'request'

interface Member {
  github_login: string
  role: Role
  joined_at: string
}

interface Repository {
  id: number
  name: string
  full_name: string | null
  description: string | null
}

interface RepoOption { id: number; name: string }

interface JoinRequest { id: number; requester_login: string; created_at: string }
interface Invite { id: number; invitee_login: string; created_at: string }
interface Transfer { id: number; proposed_owner: string; created_at: string }
interface Activity {
  github_login: string
  pr_id: number
  repo_name: string
  pr_number: number
  decision: string
  voted_at: string
  title: string
}

interface TeamDetail {
  team: {
    id: number
    name: string
    description: string
    status: 'active' | 'archived' | 'suspended'
    membership_mode: MembershipMode
    member_count: number
    attributed_validations: number
    accepted_outcome_reviews: number
  }
  membership: Role
  members: Member[]
  repositories: Repository[]
  activity: Activity[]
  join_requests: JoinRequest[]
  invites: Invite[]
  ownership_transfers: Transfer[]
}

interface Props {
  teamId: number
  onClose: () => void
  onMembershipChanged: () => void
}

function when(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString()
}

async function post(path: string, body: Record<string, unknown>): Promise<void> {
  const csrf = await fetch('/api/csrf', { credentials: 'include' })
  if (!csrf.ok) throw new Error('Could not start a secure request. Please try again.')
  const { token } = await csrf.json() as { token: string }
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
  })
  const result = await response.json() as { error?: string }
  if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.')
}

export default function TeamWorkspace({ teamId, onClose, onMembershipChanged }: Props) {
  const [detail, setDetail] = useState<TeamDetail | null>(null)
  const [repoOptions, setRepoOptions] = useState<RepoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [invitee, setInvitee] = useState('')
  const [repoId, setRepoId] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [membershipMode, setMembershipMode] = useState<MembershipMode>('invite_only')

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/teams/${teamId}`, { credentials: 'include' })
      const result = await response.json() as TeamDetail & { error?: string }
      if (!response.ok || !result.membership) throw new Error(result.error ?? 'This Team is no longer available to you.')
      setDetail(result)
      setName(result.team.name)
      setDescription(result.team.description)
      setMembershipMode(result.team.membership_mode)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this Team.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [teamId])

  const canManage = detail?.membership === 'owner' || detail?.membership === 'admin'
  const isOwner = detail?.membership === 'owner'
  const active = detail?.team.status === 'active'

  useEffect(() => {
    if (!canManage || !active) return
    fetch('/api/teams/repository-options')
      .then(async response => response.ok ? await response.json() as { repositories?: RepoOption[] } : {})
      .then(result => setRepoOptions(result.repositories ?? []))
      .catch(() => setRepoOptions([]))
  }, [canManage, active])

  const run = async (path: string, body: Record<string, unknown>, message: string, membershipChanged = false): Promise<boolean> => {
    setError(null)
    setNotice(null)
    try {
      await post(path, body)
      setNotice(message)
      if (membershipChanged) onMembershipChanged()
      await load()
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed.')
      return false
    }
  }

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!invitee.trim()) return
    await run(`/api/teams/${teamId}/members`, { action: 'invite', github_login: invitee.trim() }, `Invitation sent to ${invitee.trim()}.`)
    setInvitee('')
  }

  const addRepository = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!repoId) return
    await run(`/api/teams/${teamId}/repositories`, { action: 'add', repo_id: Number(repoId) }, 'Repository focus added.')
    setRepoId('')
  }

  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await run(`/api/teams/${teamId}/settings`, {
      action: 'update', name, description, membership_mode: membershipMode,
    }, 'Team settings saved.')
  }

  if (loading) return <div className="tab-loading">Loading your Team…</div>
  if (!detail) return <div className="team-workspace team-workspace--error">{error ?? 'Could not load this Team.'}</div>

  const focusedRepoIds = new Set(detail.repositories.map(repository => repository.id))
  const availableRepos = repoOptions.filter(repository => !focusedRepoIds.has(repository.id))

  return (
    <section className="team-workspace" aria-live="polite">
      <header className="team-workspace__header">
        <div>
          <button type="button" className="team-back" onClick={onClose}>← All Teams</button>
          <span className="teams-kicker">Your Team · {detail.membership}</span>
          <h2>{detail.team.name}</h2>
          {detail.team.description && <p>{detail.team.description}</p>}
        </div>
        <dl className="team-workspace__totals">
          <div><dt>Members</dt><dd>{detail.team.member_count}</dd></div>
          <div><dt>Validations</dt><dd>{detail.team.attributed_validations}</dd></div>
          <div><dt>Accepted outcomes</dt><dd>{detail.team.accepted_outcome_reviews}</dd></div>
        </dl>
      </header>

      {detail.team.status !== 'active' && (
        <p className="team-status-notice">This Team is {detail.team.status}. Its history is preserved, but membership and repository changes are paused.</p>
      )}
      {error && <p className="teams-form-error" role="alert">{error}</p>}
      {notice && <p className="teams-form-success" role="status">{notice}</p>}

      <div className="team-workspace__grid">
        <section className="team-workspace-card">
          <div className="team-card-heading"><h3>Members</h3><span>{detail.members.length}</span></div>
          <ul className="team-member-list">
            {detail.members.map(member => (
              <li key={member.github_login}>
                <div><strong>{member.github_login}</strong><span>{member.role}</span></div>
                {active && canManage && member.role !== 'owner' && (
                  <div className="team-inline-actions">
                    {isOwner && <button type="button" onClick={() => void run(`/api/teams/${teamId}/members`, { action: 'set_admin', github_login: member.github_login, role: member.role === 'admin' ? 'member' : 'admin' }, member.role === 'admin' ? 'Admin role removed.' : 'Made a Team admin.')}>{member.role === 'admin' ? 'Remove admin' : 'Make admin'}</button>}
                    <button type="button" className="team-action-danger" onClick={() => void run(`/api/teams/${teamId}/members`, { action: 'remove', github_login: member.github_login }, `${member.github_login} was removed.`, true)}>Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {active && canManage && (
            <form className="team-compact-form" onSubmit={invite}>
              <label htmlFor="team-invite">Invite by GitHub login</label>
              <div><input id="team-invite" value={invitee} onChange={event => setInvitee(event.target.value)} placeholder="octocat" required /><button type="submit">Invite</button></div>
            </form>
          )}
          {active && !isOwner && (
            <button type="button" className="team-text-button team-action-danger" onClick={() => void run(`/api/teams/${teamId}/members`, { action: 'leave' }, 'You left the Team.', true).then(left => { if (left) onClose() })}>Leave Team</button>
          )}
        </section>

        <section className="team-workspace-card">
          <div className="team-card-heading"><h3>Focused repositories</h3><span>{detail.repositories.length}</span></div>
          {detail.repositories.length === 0 ? <p className="team-empty">No repository focus yet.</p> : (
            <ul className="team-repository-list">
              {detail.repositories.map(repository => <li key={repository.id}><span>{repository.name}</span>{active && canManage && <button type="button" className="team-action-danger" onClick={() => void run(`/api/teams/${teamId}/repositories`, { action: 'remove', repo_id: repository.id }, 'Repository focus removed.')}>Remove</button>}</li>)}
            </ul>
          )}
          {active && canManage && availableRepos.length > 0 && (
            <form className="team-compact-form" onSubmit={addRepository}>
              <label htmlFor="team-repository">Add a repository focus</label>
              <div><select id="team-repository" value={repoId} onChange={event => setRepoId(event.target.value)} required><option value="">Choose a repository</option>{availableRepos.map(repository => <option key={repository.id} value={repository.id}>{repository.name}</option>)}</select><button type="submit">Add</button></div>
            </form>
          )}
        </section>

        <section className="team-workspace-card team-workspace-card--wide">
          <div className="team-card-heading"><h3>Team activity</h3><span>Members only</span></div>
          {detail.activity.length === 0 ? <p className="team-empty">No attributed validations yet.</p> : (
            <ul className="team-activity-list">
              {detail.activity.map(activity => <li key={`${activity.pr_id}-${activity.github_login}`}><strong>{activity.github_login}</strong><span>{activity.decision} · {activity.repo_name} #{activity.pr_number}</span><time dateTime={activity.voted_at}>{when(activity.voted_at)}</time></li>)}
            </ul>
          )}
        </section>

        {canManage && active && (
          <section className="team-workspace-card">
            <div className="team-card-heading"><h3>Join requests</h3><span>{detail.join_requests.length}</span></div>
            {detail.join_requests.length === 0 ? <p className="team-empty">No pending requests.</p> : <ul className="team-request-list">{detail.join_requests.map(request => <li key={request.id}><strong>{request.requester_login}</strong><div className="team-inline-actions"><button type="button" onClick={() => void run(`/api/teams/${teamId}/join-requests`, { action: 'resolve', request_id: request.id, status: 'accepted' }, `${request.requester_login} joined the Team.`, true)}>Accept</button><button type="button" className="team-action-danger" onClick={() => void run(`/api/teams/${teamId}/join-requests`, { action: 'resolve', request_id: request.id, status: 'declined' }, 'Join request declined.')}>Decline</button></div></li>)}</ul>}
          </section>
        )}

        {canManage && active && (
          <section className="team-workspace-card">
            <div className="team-card-heading"><h3>Pending invitations</h3><span>{detail.invites.length}</span></div>
            {detail.invites.length === 0 ? <p className="team-empty">No pending invitations.</p> : <ul className="team-request-list">{detail.invites.map(invite => <li key={invite.id}><strong>{invite.invitee_login}</strong><span>Sent {when(invite.created_at)}</span></li>)}</ul>}
          </section>
        )}

        {canManage && (
          <section className="team-workspace-card team-workspace-card--wide">
            <div className="team-card-heading"><h3>Team settings</h3><span>{isOwner ? 'Owner' : 'Admin'}</span></div>
            <form className="team-settings-form" onSubmit={saveSettings}>
              <label>Team name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} required disabled={!active} /></label>
              <label>Description<input value={description} onChange={event => setDescription(event.target.value)} maxLength={500} disabled={!active} /></label>
              <label>Membership<select value={membershipMode} onChange={event => setMembershipMode(event.target.value as MembershipMode)} disabled={!active}><option value="invite_only">Invite only</option><option value="request">Open to join requests</option></select></label>
              {active && <button type="submit">Save settings</button>}
            </form>
            {isOwner && (
              <div className="team-owner-controls">
                {active && detail.members.filter(member => member.role !== 'owner').length > 0 && <div className="team-compact-form"><label htmlFor="team-transfer">Transfer ownership</label><div><select id="team-transfer" value={transferTo} onChange={event => setTransferTo(event.target.value)}><option value="">Choose a current member</option>{detail.members.filter(member => member.role !== 'owner').map(member => <option key={member.github_login} value={member.github_login}>{member.github_login}</option>)}</select><button type="button" disabled={!transferTo} onClick={() => void run(`/api/teams/${teamId}/members`, { action: 'propose_transfer', github_login: transferTo }, `Ownership transfer proposed to ${transferTo}.`)}>Request transfer</button></div></div>}
                {detail.ownership_transfers.map(transfer => <p className="team-empty" key={transfer.id}>Waiting for {transfer.proposed_owner} to accept ownership.</p>)}
                {detail.team.status !== 'suspended' && <button type="button" className="team-text-button team-action-danger" onClick={() => void run(`/api/teams/${teamId}/settings`, { action: active ? 'archive' : 'reactivate' }, active ? 'Team archived. Its history is preserved.' : 'Team reactivated.', true)}>{active ? 'Archive Team' : 'Reactivate Team'}</button>}
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
