import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import TeamWorkspace from './TeamWorkspace'
import { emptyMyTeams, errorMessage, teamGet, teamInitials, teamLogoMark, teamPost, type MembershipMode, type MyTeams, type Team, type TeamLogoKey } from './teamApi'
import TeamLogoPicker from './TeamLogoPicker'
import './teams.css'

interface Props { data: Team[]; loading: boolean; onCreated: () => void }
interface LeaderboardRow { id: number; name: string; status: string; accepted_outcome_reviews: number; attributed_validations: number; active_contributors: number; validations_per_active_contributor: number }

export default function TeamsTab({ data, loading, onCreated }: Props) {
  const { user, loading: authLoading } = useAuth()
  const [params, setParams] = useSearchParams()
  const teamId = Number(params.get('team'))
  const creating = params.get('create') === '1'
  const view = params.get('view') === 'explore' || !user ? 'explore' : 'mine'
  const [mine, setMine] = useState<MyTeams>(emptyMyTeams)
  const [mineLoading, setMineLoading] = useState(true)
  const [mineError, setMineError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<MembershipMode>('invite_only')
  const [logoKey, setLogoKey] = useState<TeamLogoKey>('initials')
  const [query, setQuery] = useState('')
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<'all_time' | '90d'>('all_time')
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const nameInput = useRef<HTMLInputElement>(null)

  const loadMine = useCallback(async () => {
    if (!user) { setMine(emptyMyTeams); setMineLoading(false); return }
    setMineError(null)
    try { setMine(await teamGet<MyTeams>('/api/teams/mine')) }
    catch (caught) { setMineError(errorMessage(caught)) }
    finally { setMineLoading(false) }
  }, [user])

  useEffect(() => { setMine(emptyMyTeams); setMineLoading(true); void loadMine() }, [loadMine])
  useEffect(() => { if (creating) nameInput.current?.focus() }, [creating])
  const openTeam = (id: number) => setParams({ view: 'mine', team: String(id) })
  const refreshed = () => { void loadMine(); onCreated() }

  async function createTeam(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const result = await teamPost<{ team: Team }>('/api/teams', { name, description, membership_mode: mode, logo_key: logoKey })
      if (!result.team?.id) throw new Error('The Team was not returned. Refresh Your teams before trying again.')
      setQuery('')
      openTeam(result.team.id)
      setName(''); setDescription(''); setMode('invite_only'); setLogoKey('initials')
      refreshed()
    } catch (caught) { setError(errorMessage(caught)) }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (view !== 'explore') return
    const controller = new AbortController()
    setLeaderboardLoading(true); setLeaderboardError(null)
    void teamGet<{ teams: LeaderboardRow[] }>('/api/teams/leaderboard?period=' + leaderboardPeriod, controller.signal)
      .then(result => setLeaderboard(result.teams))
      .catch(caught => { if (!controller.signal.aborted) setLeaderboardError(errorMessage(caught)) })
      .finally(() => { if (!controller.signal.aborted) setLeaderboardLoading(false) })
    return () => controller.abort()
  }, [view, leaderboardPeriod])

  async function accept(team: number, body: Record<string, unknown>) {
    if (busy) return
    setBusy(true); setError(null)
    try { await teamPost('/api/teams/' + team + '/members', body); openTeam(team); refreshed() }
    catch (caught) { setError(errorMessage(caught)) }
    finally { setBusy(false) }
  }

  if (authLoading) return <p className="team-empty" role="status">Loading Teams…</p>
  if (Number.isSafeInteger(teamId) && teamId > 0) {
    return <TeamWorkspace key={String(user?.login) + teamId} teamId={teamId} onClose={() => setParams({ view })} onMembershipChanged={refreshed} />
  }
  const teams = view === 'mine' ? mine.teams : [...data].sort((a, b) => b.accepted_outcome_reviews - a.accepted_outcome_reviews || b.attributed_validations - a.attributed_validations || a.name.localeCompare(b.name))
  const filtered = teams.filter(team => (team.name + ' ' + (team.description ?? '')).toLowerCase().includes(query.toLowerCase()))

  return <div className="teams-ui">
    <header className="teams-heading">
      <div><h2>Teams</h2><p>Review together. Make a shared impact.</p></div>
      {user && !creating && <button className="team-button team-button--primary" onClick={() => { setError(null); setParams({ view, create: '1' }) }}>+ Create team</button>}
    </header>
    {creating && user && <section className="team-surface team-create" aria-labelledby="create-heading">
      <div className="team-section-heading"><div><h3 id="create-heading">Create a team</h3><p>Start with a name. You can invite members next.</p></div></div>
      <form className="team-form" onSubmit={createTeam}>
        <fieldset disabled={busy}>
          <label>Team name<input ref={nameInput} value={name} onChange={event => setName(event.target.value)} required maxLength={80} placeholder="e.g. Python reviewers" /></label>
          <label>Description <span className="team-optional">(optional)</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={500} rows={2} placeholder="What will your team work on?" /></label>
          <label>How people join<select value={mode} onChange={event => setMode(event.target.value as MembershipMode)}><option value="invite_only">By invitation only</option><option value="request">Open membership</option></select></label>
          <TeamLogoPicker value={logoKey} onChange={setLogoKey} disabled={busy} name="create-team-logo" />
          <p className="team-help">Team totals are public. Members and their activity are visible only inside the team.</p>
          {error && <p className="team-error" role="alert">{error}</p>}
          <div className="team-actions"><button className="team-button team-button--primary" disabled={!name.trim()}>{busy ? 'Creating…' : 'Create team'}</button><button className="team-button" type="button" onClick={() => { setError(null); setParams({ view }) }}>Cancel</button></div>
        </fieldset>
      </form>
    </section>}
    {!creating && error && <p className="team-error" role="alert">{error}</p>}
    <nav className="team-tabs" aria-label="Teams directory">
      {user && <Link to="?view=mine" aria-current={view === 'mine' ? 'page' : undefined}>Your teams <span>{mine.teams.length}</span></Link>}
      <Link to="?view=explore" aria-current={view === 'explore' ? 'page' : undefined}>Explore teams</Link>
    </nav>
    {view === 'mine' && <>
      {mineError && <div className="team-error" role="alert">{mineError} <button className="team-link" onClick={() => void loadMine()}>Retry</button></div>}
      {(mine.invites.length > 0 || mine.ownership_transfers.length > 0 || mine.join_requests.length > 0) && <section className="team-surface team-inbox" aria-label="Invitations and requests">
        <h3>Invitations & requests</h3>
        {mine.invites.map(invite => <div className="team-row" key={'invite-' + invite.id}><div><strong>{invite.team_name}</strong><p>You’re invited to join this team.</p></div><button disabled={busy} className="team-button team-button--primary" onClick={() => void accept(invite.team_id, { action: 'accept_invite', invite_id: invite.id })}>Accept invitation</button></div>)}
        {mine.ownership_transfers.map(transfer => <div className="team-row" key={'transfer-' + transfer.id}><div><strong>{transfer.team_name}</strong><p>You’ve been offered ownership. The current owner becomes a member when you accept.</p></div><button disabled={busy} className="team-button" onClick={() => void accept(transfer.team_id, { action: 'accept_transfer', transfer_id: transfer.id })}>Accept ownership</button></div>)}
        {mine.join_requests.map(request => <div className="team-row" key={'request-' + request.id}><div><strong>{request.team_name}</strong><p>Your join request is awaiting approval.</p></div><span className="team-badge">Pending</span></div>)}
      </section>}
    </>}
    {view === 'explore' && <section className="team-surface team-leaderboard" aria-labelledby="team-leaderboard-heading">
      <div className="team-section-heading"><div><h3 id="team-leaderboard-heading">Team leaderboard</h3><p>{leaderboardPeriod === 'all_time' ? 'All-time achievement · accepted outcomes, then validations.' : 'Recent activity · last 90 days, with context per active contributor.'}</p></div><div className="team-period-tabs" role="tablist" aria-label="Leaderboard period">
        <button role="tab" aria-selected={leaderboardPeriod === 'all_time'} className={leaderboardPeriod === 'all_time' ? 'is-selected' : ''} onClick={() => setLeaderboardPeriod('all_time')}>All time</button>
        <button role="tab" aria-selected={leaderboardPeriod === '90d'} className={leaderboardPeriod === '90d' ? 'is-selected' : ''} onClick={() => setLeaderboardPeriod('90d')}>Last 90 days</button>
      </div></div>
      {leaderboardError ? <p className="team-error">{leaderboardError} <button className="team-link" onClick={() => setLeaderboardPeriod(period => period)}>Retry</button></p> : leaderboardLoading ? <p className="team-empty" role="status">Loading leaderboard…</p> : <ol className="team-leaderboard-list">{leaderboard.map((team, index) => <li key={team.id} className="team-leaderboard-row"><span className="team-rank">{index + 1}</span><span className="team-avatar">{teamLogoMark((data.find(item => item.id === team.id)?.logo_key)) ?? teamInitials(team.name)}</span><div className="team-row-main"><Link to={'?view=explore&team=' + team.id}><strong>{team.name}</strong></Link><span className="team-meta">{team.status !== 'active' ? team.status : leaderboardPeriod === 'all_time' ? 'All-time achievement' : 'Recent activity'}</span></div><div className="team-directory-stats"><span><strong>{leaderboardPeriod === 'all_time' ? team.accepted_outcome_reviews : team.attributed_validations}</strong>{leaderboardPeriod === 'all_time' ? 'Accepted outcomes' : 'Validations'}</span>{leaderboardPeriod === '90d' && <span><strong>{team.validations_per_active_contributor.toFixed(1)}</strong>Per active contributor</span>}</div></li>)}</ol>}
    </section>}
    <div className="team-directory-tools">
      <label className="team-search"><span className="team-sr-only">Search teams</span><input type="search" placeholder={view === 'mine' ? 'Find one of your teams…' : 'Search teams…'} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p>{view === 'mine' ? 'Your membership across OASIS' : 'All-time achievement · ranked by accepted outcomes'}</p>
    </div>
    {(view === 'mine' ? mineLoading : loading) ? <p className="team-empty" role="status">Loading teams…</p> : filtered.length === 0 ? <div className="team-empty team-surface"><h3>{query ? 'No matching teams' : view === 'mine' ? 'Your next review could be a team effort.' : 'No teams yet'}</h3><p>{query ? 'Try another name or clear your search.' : view === 'mine' ? 'Create a team or explore teams that welcome new members.' : 'Start the first team and invite a fellow reviewer.'}</p>{!query && user && <div className="team-actions"><button className="team-button team-button--primary" onClick={() => setParams({ view, create: '1' })}>Create team</button>{view === 'mine' && <Link className="team-button" to="?view=explore">Explore teams</Link>}</div>}</div> : <div className="team-directory-list team-surface">
      {filtered.map(team => <Link key={team.id} className="team-directory-row" to={'?view=' + view + '&team=' + team.id}>
        <span className="team-avatar" aria-hidden="true">{teamLogoMark(team.logo_key) ?? teamInitials(team.name)}</span>
        <div className="team-directory-name"><strong>{team.name}</strong><p>{team.description || 'An OASIS community team'}</p><span className="team-meta">{view === 'mine' && 'role' in team ? String(team.role) + ' · ' : ''}{team.status !== 'active' ? team.status : team.membership_mode === 'request' ? 'Open membership' : 'Invite only'}</span></div>
        {view === 'explore' && 'accepted_outcome_reviews' in team && <div className="team-directory-stats"><span><strong>{team.accepted_outcome_reviews}</strong>Accepted outcomes</span><span><strong>{team.attributed_validations}</strong>Validations</span></div>}
        <span className="team-row-arrow" aria-hidden="true">→</span>
      </Link>)}
    </div>}
    <p className="team-help">{view === 'mine' ? 'Your work stays yours. Choose a team when submitting a validation to add it to the team’s totals.' : 'Accepted outcomes count reviews on pull requests later accepted upstream. Validation count breaks ties. Membership and individual activity stay private.'}</p>
  </div>
}
