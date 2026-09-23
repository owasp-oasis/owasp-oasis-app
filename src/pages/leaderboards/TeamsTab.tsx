import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import TeamWorkspace from './TeamWorkspace'
import './teams.css'

interface Team {
  id: number
  name: string
  description: string
  membership_mode: 'invite_only' | 'request'
  status: 'active' | 'archived' | 'suspended'
  member_count: number
  attributed_validations: number
  accepted_outcome_reviews: number
  active_contributors?: number
  validations_per_active_contributor?: number
}

interface MyTeam {
  id: number
  name: string
  role: 'owner' | 'admin' | 'member'
  status: 'active' | 'archived' | 'suspended'
}

interface Invitation { id: number; team_id: number; team_name: string }
interface PendingJoinRequest { id: number; team_id: number; team_name: string }
interface OwnershipTransfer { id: number; team_id: number; team_name: string }

interface Props {
  data: Team[]
  loading: boolean
  onCreated: () => void
}

async function csrfPost(path: string, body: unknown): Promise<Response> {
  const csrf = await fetch('/api/csrf', { credentials: 'include' })
  if (!csrf.ok) throw new Error('Could not start a secure request. Please try again.')
  const { token } = await csrf.json() as { token: string }
  return fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token },
    body: JSON.stringify(body),
  })
}

export default function TeamsTab({ data, loading, onCreated }: Props) {
  const { user, loading: authLoading } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [membershipMode, setMembershipMode] = useState<'invite_only' | 'request'>('invite_only')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [myTeams, setMyTeams] = useState<MyTeam[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [pendingJoinRequests, setPendingJoinRequests] = useState<PendingJoinRequest[]>([])
  const [ownershipTransfers, setOwnershipTransfers] = useState<OwnershipTransfer[]>([])
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null)
  const [requestedTeamIds, setRequestedTeamIds] = useState<Set<number>>(new Set())

  const loadMine = async () => {
    if (!user) return
    try {
      const response = await fetch('/api/teams/mine', { credentials: 'include' })
      if (!response.ok) return
      const result = await response.json() as { teams?: MyTeam[]; invites?: Invitation[]; join_requests?: PendingJoinRequest[]; ownership_transfers?: OwnershipTransfer[] }
      setMyTeams(result.teams ?? [])
      setInvitations(result.invites ?? [])
      setPendingJoinRequests(result.join_requests ?? [])
      setOwnershipTransfers(result.ownership_transfers ?? [])
    } catch {
      // The public directory is still useful if the personal workspace cannot load.
    }
  }

  useEffect(() => {
    if (user) void loadMine()
    else {
      setMyTeams([])
      setInvitations([])
      setPendingJoinRequests([])
      setOwnershipTransfers([])
      setSelectedTeamId(null)
    }
  }, [user])

  const createTeam = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      const response = await csrfPost('/api/teams', { name, description, membership_mode: membershipMode })
      const result = await response.json() as { error?: string; team?: { id: number } }
      if (!response.ok || !result.team?.id) throw new Error(result.error ?? 'Could not create the Team')
      setName('')
      setDescription('')
      setMembershipMode('invite_only')
      await loadMine()
      onCreated()
      // Creation ends in the Team workspace, not an inline confirmation that
      // leaves the owner to find their new Team again in the directory.
      setSelectedTeamId(result.team.id)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not create the Team')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="tab-loading">Loading Teams…</div>

  if (selectedTeamId) {
    return <TeamWorkspace teamId={selectedTeamId} onClose={() => setSelectedTeamId(null)} onMembershipChanged={() => { void loadMine(); onCreated() }} />
  }

  const ordered = [...data].sort((a, b) =>
    b.accepted_outcome_reviews - a.accepted_outcome_reviews ||
    b.attributed_validations - a.attributed_validations ||
    a.name.localeCompare(b.name),
  )

  const postMemberAction = async (teamId: number, body: Record<string, unknown>) => {
    const response = await csrfPost(`/api/teams/${teamId}/members`, body)
    const result = await response.json() as { error?: string }
    if (!response.ok) throw new Error(result.error ?? 'The request could not be completed.')
  }

  const acceptInvitation = async (invite: Invitation) => {
    setFormError(null)
    try {
      await postMemberAction(invite.team_id, { action: 'accept_invite', invite_id: invite.id })
      await loadMine()
      setSelectedTeamId(invite.team_id)
      onCreated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not accept the invitation.')
    }
  }

  const acceptTransfer = async (transfer: OwnershipTransfer) => {
    setFormError(null)
    try {
      await postMemberAction(transfer.team_id, { action: 'accept_transfer', transfer_id: transfer.id })
      await loadMine()
      setSelectedTeamId(transfer.team_id)
      onCreated()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not accept ownership.')
    }
  }

  const requestToJoin = async (team: Team) => {
    setFormError(null)
    try {
      const response = await csrfPost(`/api/teams/${team.id}/join-requests`, { action: 'request' })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error ?? 'Could not request to join this Team.')
      setRequestedTeamIds(previous => new Set([...previous, team.id]))
      await loadMine()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not request to join this Team.')
    }
  }

  return (
    <div className="teams-tab">
      <section className="teams-intro">
        <div>
          <span className="teams-kicker">Community collaboration</span>
          <h2>Teams</h2>
          <p>
            Work with fellow OASIS members while keeping each person’s validation activity their own.
            A submission can optionally credit one Team, and Team totals are public.
          </p>
        </div>
        <div className="teams-privacy-note">
          <strong>Private by default</strong>
          <span>Membership, member activity, and invitations are visible only to current Team members.</span>
        </div>
      </section>

      {!authLoading && user && (
        <section className="team-create-card" aria-labelledby="team-create-heading">
          <div>
            <h3 id="team-create-heading">Start a Team</h3>
            <p>Any signed-in OASIS member can create a Team.</p>
          </div>
          <form onSubmit={createTeam} className="team-create-form">
            <label>
              Team name
              <input value={name} onChange={event => setName(event.target.value)} maxLength={80} required />
            </label>
            <label>
              Short description <span className="teams-optional">optional</span>
              <input value={description} onChange={event => setDescription(event.target.value)} maxLength={500} />
            </label>
            <label>
              Membership
              <select value={membershipMode} onChange={event => setMembershipMode(event.target.value as 'invite_only' | 'request')}>
                <option value="invite_only">Invite only</option>
                <option value="request">Open to join requests</option>
              </select>
            </label>
            <button className="btn btn-secondary" type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create Team'}
            </button>
          </form>
          {formError && <p className="teams-form-error" role="alert">{formError}</p>}
        </section>
      )}

      {!authLoading && !user && (
        <p className="tab-note">Sign in with GitHub to start a Team or take part in one.</p>
      )}

      {!authLoading && user && (myTeams.length > 0 || invitations.length > 0 || pendingJoinRequests.length > 0 || ownershipTransfers.length > 0) && (
        <section className="teams-membership" aria-labelledby="your-teams-heading">
          <div className="teams-section-heading"><div><h3 id="your-teams-heading">Your Teams</h3><p>Membership, people, and activity stay inside each Team.</p></div></div>
          <div className="teams-membership-grid">
            {myTeams.map(team => <button key={team.id} type="button" className="team-membership-card" onClick={() => setSelectedTeamId(team.id)}><strong>{team.name}</strong><span>{team.role} · {team.status}</span><small>Open workspace →</small></button>)}
            {invitations.map(invite => <div key={invite.id} className="team-membership-card team-membership-card--invite"><strong>Invitation to {invite.team_name}</strong><span>Accept to view this Team’s private workspace.</span><button type="button" onClick={() => void acceptInvitation(invite)}>Accept invitation</button></div>)}
            {pendingJoinRequests.map(request => <div key={request.id} className="team-membership-card team-membership-card--pending"><strong>Join request for {request.team_name}</strong><span>Waiting for a Team manager to respond.</span></div>)}
            {ownershipTransfers.map(transfer => <div key={transfer.id} className="team-membership-card team-membership-card--invite"><strong>Ownership offered for {transfer.team_name}</strong><span>Accepting makes you the Team owner.</span><button type="button" onClick={() => void acceptTransfer(transfer)}>Accept ownership</button></div>)}
          </div>
        </section>
      )}

      <section aria-labelledby="team-ranking-heading">
        <div className="teams-section-heading">
          <div>
            <h3 id="team-ranking-heading">All-time achievement</h3>
            <p>Ranked by reviews on pull requests later accepted upstream; validation count breaks ties.</p>
          </div>
          <span className="teams-window">Also tracked: 90-day activity</span>
        </div>

        {ordered.length === 0 ? (
          <div className="tab-empty">No Teams yet. Start the first one.</div>
        ) : (
          <ol className="teams-ranking">
            {ordered.map((team, index) => (
              <li key={team.id} className="team-ranking-row">
                <span className="team-rank">{index + 1}</span>
                <div className="team-ranking-name">
                  <strong>{team.name}</strong>
                  {team.description && <span>{team.description}</span>}
                  {team.status !== 'active' && <em>{team.status}</em>}
                  {user && team.membership_mode === 'request' && team.status === 'active' && !myTeams.some(myTeam => myTeam.id === team.id) && (
                    <button type="button" className="team-join-button" disabled={requestedTeamIds.has(team.id) || pendingJoinRequests.some(request => request.team_id === team.id)} onClick={() => void requestToJoin(team)}>{requestedTeamIds.has(team.id) || pendingJoinRequests.some(request => request.team_id === team.id) ? 'Join requested' : 'Request to join'}</button>
                  )}
                </div>
                <dl className="team-stats">
                  <div><dt>Accepted outcomes</dt><dd>{team.accepted_outcome_reviews}</dd></div>
                  <div><dt>Validations</dt><dd>{team.attributed_validations}</dd></div>
                  <div><dt>Members</dt><dd>{team.member_count}</dd></div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
