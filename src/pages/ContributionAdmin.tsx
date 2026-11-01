import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import WorkspaceLayout from './workspace/WorkspaceLayout'
import { useWorkspaceData } from './workspace/useWorkspaceData'
import { teamPost, errorMessage } from './workspace/teamApi'
import { CONTRIBUTION_ROLES } from '../../worker/contributionRoles'
import { roleName, type Assignment, type ContributionProfile } from '../components/ContributionRoles/api'
import Assignments from '../components/ContributionRoles/Assignments'
import '../components/ContributionRoles/ContributionRoles.css'

interface Options { members: { github_user_id: number; github_login: string }[]; repositories: { id: number; full_name: string }[] }
export default function ContributionAdmin() {
  const { user, loading } = useAuth()
  if (loading) return <p role="status">Loading account…</p>
  if (!user) return <WorkspaceLayout title="Contribution roles"><p>Sign in as an administrator to manage assignments.</p><a href="/api/auth/login" className="ws-button">Sign in with GitHub</a></WorkspaceLayout>
  if (user.role !== 'admin') return <WorkspaceLayout title="Contribution roles"><p>Administrators manage repository assignments.</p><Link to="/workspace/preferences">View my roles</Link></WorkspaceLayout>
  return <WorkspaceLayout title="Contribution roles"><Management /></WorkspaceLayout>
}
function Management() {
  const [query, setQuery] = useState('')
  const [repoQuery, setRepoQuery] = useState('')
  const [member, setMember] = useState('')
  const options = useWorkspaceData<Options>('/api/admin/contribution-roles?q=' + encodeURIComponent(query) + '&repo_q=' + encodeURIComponent(repoQuery), { members: [], repositories: [] })
  return <div className="contribution-admin">
    <section className="ws-card ws-preference-card"><h2>Repository responsibilities</h2><p>Confirm repo stewards and designated maintainer contacts after agreeing the responsibility with the member. These assignments do not grant application permissions.</p>
      <label>Find a member<input type="search" placeholder="Search GitHub username" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label>Member<select value={member} onChange={e => setMember(e.target.value)} disabled={options.loading || !!options.error}><option value="">Choose a member</option>{member && !options.data.members.some(item => String(item.github_user_id) === member) && <option value={member}>Selected member #{member}</option>}{options.data.members.map(item => <option key={item.github_user_id} value={item.github_user_id}>{item.github_login}</option>)}</select></label>
      {options.loading && <p role="status">Loading members and repositories…</p>}
      {options.error && <p className="ws-error" role="alert">{options.error} <button className="ws-button" onClick={options.retry}>Retry</button></p>}
      <p className="contribution-help">Members appear after visiting My queue or Preferences, or signing in again. Showing up to 50 matches; search to narrow the list.</p>
    </section>
    {member && <MemberAssignments key={member} member={member} repos={options.data.repositories} repoQuery={repoQuery} setRepoQuery={setRepoQuery} optionsLoading={options.loading || !!options.error} />}
  </div>
}
function MemberAssignments({ member, repos, repoQuery, setRepoQuery, optionsLoading }: { member: string; repos: Options['repositories']; repoQuery: string; setRepoQuery: (value: string) => void; optionsLoading: boolean }) {
  const { data, loading, error, retry } = useWorkspaceData<{ profile?: ContributionProfile }>('/api/admin/contribution-roles?member=' + member, {})
  const [updated, setUpdated] = useState<ContributionProfile | null>(null)
  const [repo, setRepo] = useState('')
  const [role, setRole] = useState<'steward' | 'contact'>('steward')
  const [agreed, setAgreed] = useState(false)
  const [ending, setEnding] = useState<Assignment | null>(null)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState('')
  const profile = updated ?? data.profile
  async function mutate(action: 'assign' | 'end', repository: number, assignedRole: 'steward' | 'contact') {
    setBusy(true); setSaveError(''); setNotice('')
    try {
      const result = await teamPost<{ profile: ContributionProfile }>('/api/admin/contribution-roles', { github_user_id: Number(member), repo_id: repository, role: assignedRole, action })
      setUpdated(result.profile); setEnding(null); setAgreed(false)
      setNotice(action === 'assign' ? 'Assignment confirmed. It is now visible in the member’s Preferences.' : 'Assignment ended. It now appears in the member’s history.')
    } catch (e) { setSaveError(errorMessage(e)) } finally { setBusy(false) }
  }
  if (loading) return <p role="status">Loading member roles…</p>
  if (error) return <p className="ws-error" role="alert">{error} <button className="ws-button" onClick={retry}>Retry member</button></p>
  if (!profile) return null
  return <>
    <section className="ws-card ws-preference-card"><h2>{profile.github_login}</h2><p>Interested in: {profile.interests.length ? [...CONTRIBUTION_ROLES.filter(item => profile.interests.includes(item.id) && item.id !== 'other').map(item => item.name), ...(profile.interests.includes('other') && profile.other_interest ? [`Other: ${profile.other_interest}`] : [])].join(', ') : 'No roles selected yet'}</p><Assignments assignments={profile.assignments} end={setEnding} busy={busy} />
      {ending && <div className="contribution-confirm"><p>End {roleName(ending.role).toLowerCase()} responsibility for {ending.repository}? Their interests will stay unchanged.</p><div><button className="ws-button" disabled={busy} onClick={() => setEnding(null)}>Cancel</button><button className="ws-button ws-button--primary" disabled={busy} onClick={() => void mutate('end', ending.repo_id, ending.role)}>Confirm end</button></div></div>}
    </section>
    <form className="ws-card ws-preference-card contribution-form" onSubmit={e => { e.preventDefault(); void mutate('assign', Number(repo), role) }}>
      <h2>Assign a repository role</h2>
      <fieldset disabled={busy}>
        <label>Find a repository<input type="search" placeholder="Filter repositories" value={repoQuery} onChange={e => { setRepoQuery(e.target.value); setRepo(''); setAgreed(false) }} /></label>
        <label>Repository<select required value={repo} disabled={optionsLoading} onChange={e => { setRepo(e.target.value); setAgreed(false) }}><option value="">Choose a repository</option>{repos.map(item => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></label>
        <label>Role<select value={role} onChange={e => { setRole(e.target.value as 'steward' | 'contact'); setAgreed(false) }}><option value="steward">Repo steward</option><option value="contact">Maintainer contact</option></select></label>
        <label className="contribution-agreement"><input type="checkbox" checked={agreed} required onChange={e => setAgreed(e.target.checked)} />I have confirmed this responsibility with the member and the relevant project or maintainer.</label>
        <button className="ws-button ws-button--primary" disabled={!agreed || !repo || optionsLoading || busy} type="submit">{busy ? 'Saving…' : 'Confirm assignment'}</button>
      </fieldset>
    </form>
    {saveError && <p className="ws-error" role="alert">{saveError}</p>}
    <p role="status">{notice}</p>
  </>
}
