import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { emptyMyTeams, errorMessage, teamBadgeThresholds, teamGet, teamInitials, teamPost, teamPut, teamUpload, type MembershipMode, type MyTeams, type Team, type TeamBadge, type TeamBadgeSettings, type TeamLogoKey, type TeamRole } from './teamApi'
import TeamLogoPicker from './TeamLogoPicker'
import TeamLogoIcon from './TeamLogoIcon'
import TeamMediaUpload from './TeamMediaUpload'

interface Member { github_login: string; role: TeamRole; joined_at: string }
interface Repository { id: number; name: string; description?: string }
interface TeamDetail {
  team: Team
  membership?: TeamRole
  members?: Member[]
  repositories?: Repository[]
  activity?: { github_login: string; pr_id: number; repo_name: string; pr_number: number; decision: string; voted_at: string; title: string }[]
  join_requests?: { id: number; requester_login: string }[]
  invites?: { id: number; invitee_login: string }[]
  ownership_transfers?: { id: number; proposed_owner: string }[]
  badge_settings?: TeamBadgeSettings
  badges?: TeamBadge[]
  user_badges_public?: boolean
}
interface Props { teamId: number; onClose: () => void; onMembershipChanged: () => void }
type Section = 'overview' | 'members' | 'repositories' | 'settings'
interface Confirmation { title: string; explanation: string; label: string; action: () => Promise<boolean> }
interface TeamSettingsSnapshot { name: string; description: string; mode: MembershipMode; logoKey: TeamLogoKey; contributionThreshold: number; publicBadges: boolean }

export default function TeamWorkspace({ teamId, onClose, onMembershipChanged }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requestedSection = params.get('section') ?? 'overview'
  const [detail, setDetail] = useState<TeamDetail | null>(null)
  const [mine, setMine] = useState<MyTeams>(emptyMyTeams)
  const [repos, setRepos] = useState<Repository[]>([])
  const [repoError, setRepoError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [invitee, setInvitee] = useState('')
  const [repoId, setRepoId] = useState('')
  const [repoQuery, setRepoQuery] = useState('')
  const [memberQuery, setMemberQuery] = useState('')
  const [transferTo, setTransferTo] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [mode, setMode] = useState<MembershipMode>('invite_only')
  const [logoKey, setLogoKey] = useState<TeamLogoKey>('initials')
  const [logoImage, setLogoImage] = useState<string | null>(null)
  const [bannerImage, setBannerImage] = useState<string | null>(null)
  const [contributionThreshold, setContributionThreshold] = useState(5)
  const [publicBadges, setPublicBadges] = useState(false)
  const [savedSettings, setSavedSettings] = useState<TeamSettingsSnapshot | null>(null)
  const [userBadgesPublic, setUserBadgesPublic] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const path = '/api/teams/' + teamId
  const canManage = detail?.membership === 'owner' || detail?.membership === 'admin'
  const isOwner = detail?.membership === 'owner'
  const active = detail?.team.status === 'active'
  const settingsDirty = savedSettings !== null && (
    savedSettings.name !== name ||
    savedSettings.description !== description ||
    savedSettings.mode !== mode ||
    savedSettings.logoKey !== logoKey ||
    savedSettings.contributionThreshold !== contributionThreshold ||
    savedSettings.publicBadges !== publicBadges
  )
  const section: Section = !detail?.membership ? 'overview' :
    requestedSection === 'members' || requestedSection === 'repositories' || (requestedSection === 'settings' && canManage) ? requestedSection : 'overview'
  const sections: { id: Section; label: string; icon: string }[] = [
    { id: 'overview', label: 'Stats & activity', icon: '◷' },
    { id: 'members', label: 'Members', icon: '◎' },
    { id: 'repositories', label: 'Repository focus', icon: '⌘' },
    ...(canManage ? [{ id: 'settings' as Section, label: 'Team administration', icon: '⚙' }] : []),
  ]
  const sectionUrl = (value: Section) => {
    const next = new URLSearchParams(params)
    next.set('section', value)
    return '?' + next.toString()
  }

  const load = useCallback(async () => {
    const result = await teamGet<TeamDetail>('/api/teams/' + teamId)
    setDetail(result)
    const nextSettings = { name: result.team.name, description: result.team.description, mode: result.team.membership_mode, logoKey: result.team.logo_key ?? 'initials', contributionThreshold: result.badge_settings?.contribution_threshold ?? 5, publicBadges: result.badge_settings?.public_display === 1 }
    setName(nextSettings.name); setDescription(nextSettings.description); setMode(nextSettings.mode); setLogoKey(nextSettings.logoKey); setLogoImage(result.team.logo_image_data ?? null); setBannerImage(result.team.banner_image_data ?? null); setContributionThreshold(nextSettings.contributionThreshold); setPublicBadges(nextSettings.publicBadges); setSavedSettings(nextSettings); setUserBadgesPublic(result.user_badges_public === true)
  }, [teamId])
  useEffect(() => { void load().catch(caught => setError(errorMessage(caught))) }, [load])
  useEffect(() => { if (user) void teamGet<MyTeams>('/api/teams/mine').then(setMine).catch(caught => setError(errorMessage(caught))) }, [user])
  useEffect(() => { heading.current?.focus() }, [detail?.team.id])
  useEffect(() => { if (confirmation) dialog.current?.showModal() }, [confirmation])
  const loadRepos = useCallback(async () => {
    setRepoError(null)
    try { setRepos((await teamGet<{ repositories: Repository[] }>('/api/teams/repository-options')).repositories) }
    catch (caught) { setRepoError(errorMessage(caught)) }
  }, [])
  useEffect(() => { if (canManage && section === 'repositories') void loadRepos() }, [canManage, section, loadRepos])

  async function run(endpoint: string, body: Record<string, unknown>, message: string, close = false): Promise<boolean> {
    if (busy) return false
    setBusy(true); setError(null); setNotice(null)
    try {
      await teamPost(path + '/' + endpoint, body)
      setNotice(message)
      onMembershipChanged()
      if (close) { onClose(); return true }
      try { await load() } catch { setError('Saved, but the view could not refresh. Reload this page to see the latest state.') }
      return true
    } catch (caught) { setError(errorMessage(caught)); return false }
    finally { setBusy(false) }
  }
  const submitInvite = async (event: FormEvent) => {
    event.preventDefault()
    if (await run('members', { action: 'invite', github_login: invitee.trim() }, 'Invitation added. They can accept it from Your teams in OASIS.')) setInvitee('')
  }
  const submitRepo = async (event: FormEvent) => {
    event.preventDefault()
    if (await run('repositories', { action: 'add', repo_id: Number(repoId) }, 'Repository added to this team’s focus.')) setRepoId('')
  }
  const uploadMedia = async (kind: 'logo' | 'banner', file: File | null, remove = false) => {
    if (busy) return
    setBusy(true); setError(null); setNotice(null)
    try {
      const result = await teamUpload<{ team: Team }>(path + '/media', file, kind, remove)
      setDetail(previous => previous ? { ...previous, team: { ...previous.team, ...result.team } } : previous)
      if (kind === 'logo') setLogoImage(result.team.logo_image_data ?? null)
      else setBannerImage(result.team.banner_image_data ?? null)
      setNotice(kind === 'logo' ? (remove ? 'Custom logo removed.' : 'Custom logo uploaded.') : (remove ? 'Team banner removed.' : 'Team banner uploaded.'))
      onMembershipChanged()
    } catch (caught) {
      setError(errorMessage(caught))
      throw caught
    } finally { setBusy(false) }
  }

  if (!detail) return <div className="teams-ui"><button className="team-link" onClick={onClose}>← Teams</button>{error ? <div className="team-error" role="alert">{error} <button className="team-link" onClick={() => { setError(null); void load().catch(caught => setError(errorMessage(caught))) }}>Retry</button></div> : <p className="team-empty" role="status">Loading team…</p>}</div>
  const members = detail.members ?? []
  const repositories = detail.repositories ?? []
  const requests = detail.join_requests ?? []
  const invites = detail.invites ?? []
  const pending = mine.join_requests.some(request => request.team_id === teamId)
  const offer = mine.invites.find(invite => invite.team_id === teamId)
  const availableRepos = repos.filter(repo => !repositories.some(focus => focus.id === repo.id) && repo.name.toLowerCase().includes(repoQuery.toLowerCase()))

  return <div className="teams-ui">
    <button className="team-link team-back" onClick={onClose}>← Teams</button>
    <header className={'teams-heading team-profile-heading' + (bannerImage ? ' has-team-banner' : '')} style={bannerImage ? { backgroundImage: `url(${bannerImage})` } : undefined}>
      <div className="team-profile-banner-overlay" aria-hidden="true" />
      <div className="team-identity"><span className="team-avatar team-avatar--large" aria-hidden="true">{logoImage ? <img className="team-logo-image" src={logoImage} alt="" /> : detail.team.logo_key === 'initials' ? teamInitials(detail.team.name) : <TeamLogoIcon logo={detail.team.logo_key} size={30} />}</span><div><h2 ref={heading} tabIndex={-1}>{detail.team.name}</h2><p>{detail.team.description || 'An OASIS community team'}</p><div className="team-meta">{detail.membership && <span className="team-badge">You’re {isOwner ? 'the owner' : 'a' + (detail.membership === 'admin' ? 'n admin' : ' member')}</span>}<span>{detail.team.membership_mode === 'request' ? 'Open membership' : 'Invite only'}</span>{!active && <span className="team-badge">{detail.team.status}</span>}</div></div></div>
      {detail.membership && active && <Link className="team-button" to={sectionUrl(canManage ? 'members' : 'repositories')}>{canManage ? 'Invite members' : 'Find a review'}</Link>}
    </header>

    <div className={detail.membership ? 'team-layout' : ''}>
    {detail.membership && <aside className="team-sidebar">
      <nav aria-label="Team sections">{sections.map(item => <Link key={item.id} to={sectionUrl(item.id)} aria-current={section === item.id ? 'page' : undefined}><span className="team-menu-icon" aria-hidden="true">{item.icon}</span>{item.label}{item.id === 'members' && requests.length > 0 && <span className="team-badge" aria-label={requests.length + ' pending requests'}>{requests.length}</span>}</Link>)}</nav>
      <p className="team-help">Member workspace<br />Team totals are public.</p>
      <label className="team-mobile-menu">Team section<select value={section} onChange={event => navigate(sectionUrl(event.target.value as Section))}>{sections.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </aside>}
    <div className="team-main" aria-busy={busy}>
    {detail.membership && <h3 className="team-view-title">{sections.find(item => item.id === section)?.label}</h3>}
    {!active && <p className="team-notice">This team is {detail.team.status}. Its history is preserved.{detail.team.status === 'archived' && isOwner ? ' Reactivate it in Team administration to resume.' : ''}</p>}
    {error && <p className="team-error" role="alert">{error}</p>}
    {notice && <p className="team-success" role="status">{notice}</p>}
    <div className="team-status-slot" aria-live="polite">{busy && <span className="team-help" role="status">Saving…</span>}</div>

    {section === 'overview' && <>
      <dl className="team-metrics">
        <div><dt>Accepted outcomes</dt><dd>{detail.team.accepted_outcome_reviews}</dd><p>Reviews on PRs accepted upstream</p></div>
        <div><dt>Validations</dt><dd>{detail.team.attributed_validations}</dd><p>Personal work credited to this team</p></div>
        <div><dt>Members</dt><dd>{detail.team.member_count}</dd><p>Contributing together</p></div>
      </dl>
      {detail.membership && <section className="team-surface team-badge-collection"><div className="team-section-heading"><div><h3>Your Team badges</h3><p>Recognition earned from membership and work attributed to this Team.</p></div></div>{(detail.badges ?? []).length === 0 ? <p className="team-empty">Your first badge will appear here when you join or reach the Team’s contribution bar.</p> : <ul className="team-badge-list">{detail.badges!.map(badge => <li className="team-badge-card" key={badge.id}><span className="team-badge-icon" aria-hidden="true">{badge.badge_key === 'membership' ? '◎' : '✦'}</span><div><strong>{badge.badge_key === 'membership' ? 'Team member' : 'Team contributor'}</strong><p>{badge.badge_key === 'membership' ? 'Membership badge' : `${badge.threshold} attributed validations`}</p></div></li>)}</ul>}<label className="team-badge-privacy"><input type="checkbox" checked={userBadgesPublic} disabled={!publicBadges || busy} onChange={async event => { const next = event.target.checked; setUserBadgesPublic(next); try { await teamPut('/api/preferences/mine', { show_team_badges: next }) } catch (caught) { setUserBadgesPublic(!next); setError(errorMessage(caught)) } }} /> Allow eligible badges from this Team on my public contributor profile{!publicBadges && <span className="team-help">The Team admin has not enabled public badge display.</span>}</label></section>}
      {!detail.membership ? <section className="team-surface team-public-info"><h3>{offer ? 'You’re invited' : 'Join this team'}</h3><p>Team totals are public. The roster, repository focus, and activity are available to members.</p>
        {!user ? <a className="team-button team-button--primary" href="/api/auth/login">Sign in with GitHub</a> : !active ? <p className="team-help">This team is not accepting new members.</p> : offer ? <button disabled={busy} className="team-button team-button--primary" onClick={() => void run('members', { action: 'accept_invite', invite_id: offer.id }, 'Welcome to the team.')}>Accept invitation</button> : detail.team.membership_mode === 'request' ? <button disabled={busy || pending} className="team-button team-button--primary" onClick={async () => { if (await run('join-requests', { action: 'request' }, 'Join request sent. A team owner or admin will review it.')) setMine(previous => ({ ...previous, join_requests: [...previous.join_requests, { id: 0, team_id: teamId, team_name: detail.team.name }] })) }}>{pending ? 'Request pending' : 'Request to join'}</button> : <p className="team-help">Membership is by invitation from an owner or admin.</p>}
      </section> : <>
        <section className="team-surface"><div className="team-section-heading"><div><h3>Recent activity</h3><p>Validations credited to this team · members only</p></div></div>
          {(detail.activity ?? []).length === 0 ? <div className="team-empty"><h4>Your team’s first validation starts with you.</h4><p>Review a pull request and choose this team before submitting.</p><Link className="team-button" to="/workspace/pull-requests">Browse pull requests</Link></div> : <ul className="team-list">{detail.activity!.map(activity => <li className="team-row" key={activity.pr_id + '-' + activity.github_login}><span className="team-person-avatar" aria-hidden="true">{teamInitials(activity.github_login)}</span><div className="team-row-main"><strong>{activity.github_login}</strong><p><a href={'https://github.com/owasp-oasis/' + encodeURIComponent(activity.repo_name) + '/pull/' + activity.pr_number} target="_blank" rel="noopener noreferrer">{activity.title || activity.repo_name + ' #' + activity.pr_number}</a></p><span className="team-help">{activity.repo_name} #{activity.pr_number}</span></div><div className="team-activity-meta"><span className="team-badge">{activity.decision}</span><time dateTime={activity.voted_at}>{new Date(activity.voted_at).toLocaleDateString()}</time></div></li>)}</ul>}
        </section>
        {!isOwner && active && <details className="team-secondary-options"><summary>Membership options</summary><button className="team-button team-button--danger" disabled={busy} onClick={() => setConfirmation({ title: 'Leave ' + detail.team.name + '?', explanation: 'You will lose access to the private workspace. Your past contributions will remain credited to the team.', label: 'Leave team', action: () => run('members', { action: 'leave' }, 'You left the team.', true) })}>Leave team</button></details>}
      </>}
    </>}

    {section === 'members' && <div className="team-content-stack">
      {canManage && active && <section className="team-surface"><div className="team-section-heading"><div><h3>Invite a member</h3><p>They’ll find the invitation in Your teams when they sign in to OASIS.</p></div></div><form className="team-inline-form" onSubmit={submitInvite}><label>GitHub username<input value={invitee} onChange={event => setInvitee(event.target.value)} placeholder="e.g. octocat" required disabled={busy} /></label><button className="team-button team-button--primary" disabled={busy || !invitee.trim()}>Send invitation</button></form></section>}
      {canManage && requests.length > 0 && <section className="team-surface"><div className="team-section-heading"><h3>Join requests <span className="team-badge">{requests.length}</span></h3></div><ul className="team-list">{requests.map(request => <li className="team-row" key={request.id}><span className="team-person-avatar" aria-hidden="true">{teamInitials(request.requester_login)}</span><strong className="team-row-main">{request.requester_login}</strong>{active && <div className="team-actions"><button disabled={busy} className="team-button team-button--primary" onClick={() => void run('join-requests', { action: 'resolve', request_id: request.id, status: 'accepted' }, request.requester_login + ' joined the team.')}>Accept</button><button disabled={busy} className="team-button" onClick={() => void run('join-requests', { action: 'resolve', request_id: request.id, status: 'declined' }, 'Request declined.')}>Decline</button></div>}</li>)}</ul></section>}
      <section className="team-surface"><div className="team-section-heading"><h3>Members <span className="team-badge">{members.length}</span></h3><label className="team-search"><span className="team-sr-only">Search members</span><input type="search" placeholder="Find a member…" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} /></label></div>
        <ul className="team-list">{members.filter(member => member.github_login.toLowerCase().includes(memberQuery.toLowerCase())).map(member => <li className="team-row" key={member.github_login}><span className="team-person-avatar" aria-hidden="true">{teamInitials(member.github_login)}</span><div className="team-row-main"><strong>{member.github_login}{member.github_login === user?.login ? ' (you)' : ''}</strong><p>{member.role}</p></div>
          {canManage && active && member.role !== 'owner' && member.github_login !== user?.login && <details className="team-member-actions"><summary>Manage<span className="team-sr-only"> {member.github_login}</span></summary><div>{isOwner && <button className="team-button" disabled={busy} onClick={() => void run('members', { action: 'set_admin', github_login: member.github_login, role: member.role === 'admin' ? 'member' : 'admin' }, 'Member role updated.')}>{member.role === 'admin' ? 'Make member' : 'Make admin'}</button>}<button className="team-button team-button--danger" disabled={busy} onClick={() => setConfirmation({ title: 'Remove ' + member.github_login + '?', explanation: 'Their past contributions stay credited to the team. They will need a new invitation to return.', label: 'Remove member', action: () => run('members', { action: 'remove', github_login: member.github_login }, 'Member removed.') })}>Remove</button></div></details>}
        </li>)}</ul>
        {!members.some(member => member.github_login.toLowerCase().includes(memberQuery.toLowerCase())) && <p className="team-empty">No members match your search.</p>}
      </section>
      {canManage && <section className="team-surface"><div className="team-section-heading"><h3>Pending invitations <span className="team-badge">{invites.length}</span></h3></div>{invites.length === 0 ? <p className="team-empty">No invitations waiting for a response.</p> : <ul className="team-list">{invites.map(invite => <li className="team-row" key={invite.id}><strong className="team-row-main">{invite.invitee_login}</strong><span className="team-badge">Awaiting acceptance</span></li>)}</ul>}</section>}
    </div>}

    {section === 'repositories' && <div className="team-content-stack">
      {canManage && active && <section className="team-surface"><div className="team-section-heading"><div><h3>Choose your focus</h3><p>Keep the repositories your team cares about close at hand.</p></div></div>{repoError ? <p className="team-error">{repoError} <button className="team-link" onClick={() => void loadRepos()}>Retry</button></p> : <form className="team-repo-form" onSubmit={submitRepo}><label>Find a repository<input type="search" value={repoQuery} onChange={event => { setRepoQuery(event.target.value); setRepoId('') }} placeholder="Filter by name…" /></label><label>Repository<select required value={repoId} onChange={event => setRepoId(event.target.value)}><option value="">{availableRepos.length ? 'Choose a repository' : 'No matching repositories'}</option>{availableRepos.map(repo => <option value={repo.id} key={repo.id}>{repo.name}</option>)}</select></label><button className="team-button team-button--primary" disabled={busy || !repoId}>Add repository</button></form>}</section>}
      <section className="team-surface"><div className="team-section-heading"><h3>Focused repositories <span className="team-badge">{repositories.length}</span></h3></div>{repositories.length === 0 ? <div className="team-empty"><h4>No repositories selected yet</h4><p>{canManage ? 'Choose a repository above to give your team a starting point.' : 'An owner or admin can add repositories for the team.'}</p></div> : <ul className="team-list">{repositories.map(repo => <li className="team-row" key={repo.id}><div className="team-row-main"><strong>{repo.name}</strong>{repo.description && <p>{repo.description}</p>}</div><div className="team-actions"><Link className="team-button" to={'/workspace/pull-requests?repo=' + repo.id}>Find reviews →</Link>{canManage && active && <button disabled={busy} className="team-link" aria-label={'Remove ' + repo.name + ' from focus'} onClick={() => void run('repositories', { action: 'remove', repo_id: repo.id }, 'Repository removed from team focus.')}>Remove</button>}</div></li>)}</ul>}</section>
    </div>}

    {section === 'settings' && <div className="team-content-stack">
      <section className="team-surface"><div className="team-section-heading"><div><h3>Team details</h3><p>Name and description appear in the public directory.</p></div></div>
        <form className="team-form" onSubmit={event => { event.preventDefault(); void run('settings', { action: 'update', name, description, membership_mode: mode, logo_key: logoKey, contribution_threshold: contributionThreshold, public_badges: publicBadges }, 'Team settings saved.') }}><fieldset disabled={busy || !active}>
          <label>Team name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
          <label>Description<textarea rows={3} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} /></label>
          <label>How people join<select value={mode} onChange={event => setMode(event.target.value as MembershipMode)}><option value="invite_only">By invitation only</option><option value="request">Open membership</option></select></label>
          <label>Contribution badge bar<select value={contributionThreshold} onChange={event => setContributionThreshold(Number(event.target.value))}>{teamBadgeThresholds.map(value => <option value={value} key={value}>{value} attributed validations</option>)}</select><span className="team-help">OASIS sets the available minimums. Earned badges are never revoked if this bar changes.</span></label>
          <label>Public badge display<select value={publicBadges ? 'public' : 'members'} onChange={event => setPublicBadges(event.target.value === 'public')}><option value="members">Members only</option><option value="public">Allow opted-in members to display badges publicly</option></select><span className="team-help">Private Team membership is never public by default. Members must also opt in individually.</span></label>
          <TeamLogoPicker value={logoKey} onChange={setLogoKey} disabled={busy || !active} name={'team-' + teamId + '-logo'} />
          <div className="team-media-settings"><div className="team-section-heading"><div><h4>Team visuals</h4><p>Upload a visual identity for the team directory and homepage.</p></div></div><TeamMediaUpload kind="logo" value={logoImage} disabled={!active} busy={busy} onUpload={file => uploadMedia('logo', file)} onRemove={() => uploadMedia('logo', null, true)} /><TeamMediaUpload kind="banner" value={bannerImage} disabled={!active} busy={busy} onUpload={file => uploadMedia('banner', file)} onRemove={() => uploadMedia('banner', null, true)} /></div>
          <p className="team-help">Roster and individual activity are visible only to current members.</p>
          <button className="team-button team-button--primary" disabled={!name.trim() || !settingsDirty}>Save changes</button>
        </fieldset></form>
      </section>
      {isOwner && <section className="team-surface"><div className="team-section-heading"><div><h3>Ownership & lifecycle</h3><p>Owner-only actions. Team history is always preserved.</p></div></div>
        {active && <div className="team-setting-block"><h4>Transfer ownership</h4><p>The new owner must accept. You’ll remain a member afterward.</p>{(detail.ownership_transfers ?? []).length > 0 ? detail.ownership_transfers!.map(transfer => <p className="team-notice" key={transfer.id}>Waiting for {transfer.proposed_owner} to accept ownership.</p>) : members.length < 2 ? <p className="team-help">Invite another member before transferring ownership.</p> : <div className="team-inline-form"><label>New owner<select value={transferTo} onChange={event => setTransferTo(event.target.value)}><option value="">Choose a member</option>{members.filter(member => member.role !== 'owner').map(member => <option key={member.github_login} value={member.github_login}>{member.github_login}</option>)}</select></label><button disabled={busy || !transferTo} className="team-button" onClick={() => setConfirmation({ title: 'Offer ownership to ' + transferTo + '?', explanation: 'You remain the owner until they accept. After acceptance, you become a regular member.', label: 'Offer ownership', action: () => run('members', { action: 'propose_transfer', github_login: transferTo }, 'Ownership offer sent.') })}>Offer ownership</button></div>}</div>}
        {detail.team.status !== 'suspended' && <div className="team-setting-block"><h4>{active ? 'Archive team' : 'Reactivate team'}</h4><p>{active ? 'Pause membership changes and new contributions. You can reactivate the team later.' : 'Resume invitations, join requests, and contribution attribution.'}</p><button className={'team-button' + (active ? ' team-button--danger' : '')} disabled={busy} onClick={() => setConfirmation({ title: active ? 'Archive this team?' : 'Reactivate this team?', explanation: active ? 'The team’s members, repositories, and history will be preserved.' : 'Your team can resume work with its existing members and history.', label: active ? 'Archive team' : 'Reactivate team', action: () => run('settings', { action: active ? 'archive' : 'reactivate' }, active ? 'Team archived. Its history is preserved.' : 'Team reactivated.') })}>{active ? 'Archive team' : 'Reactivate team'}</button></div>}
      </section>}
    </div>}

    </div>
    </div>
    <dialog ref={dialog} className="team-dialog" aria-labelledby="team-confirm-title" onCancel={event => { if (busy) event.preventDefault(); else setConfirmation(null) }} onClose={() => setConfirmation(null)}>
      {confirmation && <><h3 id="team-confirm-title">{confirmation.title}</h3><p>{confirmation.explanation}</p>{error && <p className="team-error" role="alert">{error}</p>}<div className="team-actions"><button className="team-button" autoFocus disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button><button className="team-button team-button--primary" disabled={busy} onClick={async () => { if (await confirmation.action()) dialog.current?.close() }}>{busy ? 'Saving…' : confirmation.label}</button></div></>}
    </dialog>
  </div>
}
