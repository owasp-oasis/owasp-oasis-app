import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CircleDashed, ExternalLink, Info, ShieldCheck, UserRound, X } from 'lucide-react'

type RoleAssignment = { id: string; github_user_id: number; github_login: string; github_name: string | null; role_name: string; role_description: string }
type Maintainer = { github_user_id: number; github_login: string; github_name: string | null; github_permission: 'maintain' | 'admin'; verified_at: string }
type StewardRequest = { id: string; requester_github_user_id: number; requester_login: string; requester_name: string | null; requested_at: string; status?: string }
type Management = {
  steward: { github_user_id: number; github_login: string; github_name: string | null; assigned_at: string } | null
  role_assignments: RoleAssignment[]
  maintainers: Maintainer[]
  viewer: { github_user_id: number | null; github_login: string | null; is_admin: boolean; is_steward: boolean; request: { id: string; status: string; requested_at: string; reviewed_at: string | null } | null; open_request_exists: boolean; pending_request: StewardRequest | null }
}

const roleDefinitions: Record<string, string> = {
  'OASIS Repo Security Steward': 'OASIS management is federated. A Security Steward coordinates security work within this OASIS fork and manages the repo-specific OASIS role assignments.',
  'Upstream Maintainer': 'A maintainer connects through the Maintainer Workspace. GitHub verifies Maintain or Admin access; removing this OASIS registration does not change GitHub permissions.',
}

async function getManagement(repoId: number, signal: AbortSignal): Promise<Management> {
  const response = await fetch(`/api/workspace/repos/${repoId}/management`, { credentials: 'include', cache: 'no-store', signal })
  const result = await response.json() as { ok?: boolean; error?: string } & Management
  if (!response.ok || result.ok === false) throw new Error(result.error ?? `Could not load repo roles (${response.status})`)
  return result
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const csrfResponse = await fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
  const csrf = await csrfResponse.json() as { token?: string }
  if (!csrfResponse.ok || !csrf.token) throw new Error('Could not get a security token. Refresh and try again.')
  const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.token }, body: JSON.stringify(body) })
  const result = await response.json() as T & { ok?: boolean; error?: string }
  if (!response.ok || result.ok === false) throw new Error(result.error ?? `Request failed (${response.status})`)
  return result
}

function RoleInfo({ role, description }: { role: string; description?: string }) {
  const [open, setOpen] = useState(false)
  const text = description || roleDefinitions[role] || 'A repo-specific responsibility assigned by the OASIS Repo Security Steward. This role does not restrict who can contribute or validate fixes.'
  return <span className="pp-role-info"><button type="button" aria-label={`About the ${role} role`} aria-expanded={open} onClick={() => setOpen(value => !value)}><Info size={13} /></button>{open && <span className="pp-role-info-popover" role="dialog" aria-label={`${role} role definition`}><button className="pp-role-info-close" type="button" aria-label="Close role information" onClick={() => setOpen(false)}><X size={13} /></button><strong>{role}</strong><span>{text}</span></span>}</span>
}

export default function RepoStewardshipAbout({ repoId, repoName, repoFullName }: { repoId: number; repoName: string; repoFullName: string }) {
  const [management, setManagement] = useState<Management | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RoleAssignment | null>(null)
  const [login, setLogin] = useState('')
  const [roleName, setRoleName] = useState('')
  const [description, setDescription] = useState('')
  const [removeTarget, setRemoveTarget] = useState<{ kind: 'role' | 'maintainer' | 'steward'; id: string | number; label: string; login: string } | null>(null)

  const reload = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('')
    try { setManagement(await getManagement(repoId, signal ?? new AbortController().signal)) }
    catch (caught) { if (!signal?.aborted) setError((caught as Error).message) }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [repoId])

  useEffect(() => { const controller = new AbortController(); void reload(controller.signal); return () => controller.abort() }, [reload])

  async function mutate(path: string, body: unknown, success: string): Promise<boolean> {
    setWorking(true); setError(''); setNotice('')
    try { await postJSON(path, body); setNotice(success); await reload(); return true }
    catch (caught) { setError((caught as Error).message); return false }
    finally { setWorking(false) }
  }

  function openRoleForm(assignment?: RoleAssignment) {
    setEditing(assignment ?? null); setLogin(assignment?.github_login ?? ''); setRoleName(assignment?.role_name ?? ''); setDescription(assignment?.role_description ?? ''); setFormOpen(true); setNotice(''); setError('')
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const path = `/api/workspace/repos/${repoId}/roles${editing ? `/${editing.id}` : ''}`
    const saved = await mutate(path, { login, role_name: roleName, role_description: description }, editing ? 'Repo Role assignment updated.' : 'Repo Role assigned.')
    if (!saved) return
    setFormOpen(false); setEditing(null); setLogin(''); setRoleName(''); setDescription('')
  }

  if (loading && !management) return <section className="pp-stewardship-about" aria-label="Repo Management Team"><p role="status">Loading repository roles…</p></section>
  if (!management) return <section className="pp-stewardship-about" aria-label="Repo Management Team"><p role="alert">{error || 'Repository role information is unavailable.'}</p><button type="button" onClick={() => void reload()}>Try again</button></section>

  const { steward, viewer } = management
  const requestPending = viewer.request?.status === 'pending'
  const requestDeclined = viewer.request?.status === 'declined'
  const githubProfile = (userLogin: string) => `https://github.com/${encodeURIComponent(userLogin)}`
  const discussionBody = encodeURIComponent(`Repository: ${repoFullName}\n\nUse this public issue to coordinate OASIS security work with the Repo Security Steward.`)
  const discussionUrl = `https://github.com/${repoFullName}/issues/new?title=${encodeURIComponent('OASIS repo coordination')}&body=${discussionBody}`

  return <section className="pp-stewardship-about" aria-labelledby="pp-repo-management-heading">
    <div className="pp-stewardship-heading-row"><div><span className="pp-section-eyebrow"><ShieldCheck size={14} /> OASIS project roles</span><h3 id="pp-repo-management-heading">OASIS Repo Management Team</h3><p>See who coordinates OASIS security work on <code>{repoName}</code>. Assignments organize work; anyone may contribute or validate fixes.</p></div></div>
    <section className="pp-role-assignments" aria-labelledby="pp-role-assignments-heading">
      <div className="pp-role-assignments-title"><h4 id="pp-role-assignments-heading">Role assignments</h4><div className="pp-role-assignment-tools"><span>{repoName}</span>{viewer.is_steward && <button type="button" onClick={() => openRoleForm()}>Add Repo Role</button>}</div></div>
      <div className="pp-role-assignment-list">
        {steward && <div className="pp-role-assignment pp-role-assignment--steward"><span className="pp-role-icon"><ShieldCheck size={16} /></span><div className="pp-role-name"><div className="pp-role-title"><strong>OASIS Repo Security Steward</strong><RoleInfo role="OASIS Repo Security Steward" /></div><span>Coordinates OASIS work for this fork</span></div><div className="pp-role-person"><strong>{steward.github_name || steward.github_login}</strong><a href={githubProfile(steward.github_login)} target="_blank" rel="noreferrer">@{steward.github_login} ↗</a></div></div>}
        {management.role_assignments.map(assignment => <div className="pp-role-assignment" key={assignment.id}><span className="pp-role-icon"><UserRound size={16} /></span><div className="pp-role-name"><div className="pp-role-title"><strong>{assignment.role_name}</strong><RoleInfo role={assignment.role_name} description={assignment.role_description} /></div>{assignment.role_description && <span>{assignment.role_description}</span>}</div><div className="pp-role-person"><strong>{assignment.github_name || assignment.github_login}</strong><a href={githubProfile(assignment.github_login)} target="_blank" rel="noreferrer">@{assignment.github_login} ↗</a></div>{viewer.is_steward && <div className="pp-role-row-actions"><button type="button" onClick={() => openRoleForm(assignment)}>Edit</button><button type="button" className="pp-role-remove" onClick={() => setRemoveTarget({ kind: 'role', id: assignment.id, label: assignment.role_name, login: assignment.github_login })}>Remove</button></div>}</div>)}
        {management.maintainers.map(maintainer => <div className="pp-role-assignment" key={`maintainer-${maintainer.github_user_id}`}><span className="pp-role-icon"><UserRound size={16} /></span><div className="pp-role-name"><div className="pp-role-title"><strong>Upstream Maintainer</strong><RoleInfo role="Upstream Maintainer" /></div><span>{maintainer.github_permission} access verified {new Date(maintainer.verified_at).toLocaleDateString()}</span></div><div className="pp-role-person"><strong>{maintainer.github_name || maintainer.github_login}</strong><a href={githubProfile(maintainer.github_login)} target="_blank" rel="noreferrer">@{maintainer.github_login} ↗</a></div>{viewer.is_steward && <div className="pp-role-row-actions"><button type="button" className="pp-role-remove" onClick={() => setRemoveTarget({ kind: 'maintainer', id: maintainer.github_user_id, label: 'Upstream Maintainer', login: maintainer.github_login })}>Remove</button></div>}</div>)}
        {!steward && !management.role_assignments.length && !management.maintainers.length && <p className="pp-role-help">No roles are assigned yet.</p>}
      </div>
      <p className="pp-role-help">The Steward coordinates assignments; roles do not restrict contribution or validation.</p>
      <div className="pp-maintainer-self-connect"><div><strong>Are you an upstream maintainer?</strong><span>Connect in the Maintainer Workspace. GitHub verifies your authority separately.</span></div><Link to="/workspace/maintainer-workspace">Open Maintainer Workspace <ArrowRight size={14} /></Link></div>
      {viewer.is_steward && <p className="pp-role-permission">You are the OASIS Repo Security Steward for this fork. <button className="pp-role-inline-action" type="button" onClick={() => setRemoveTarget({ kind: 'steward', id: repoId, label: 'Steward assignment', login: steward?.github_login ?? '' })}>Resign as Steward</button></p>}
      {!viewer.is_steward && viewer.is_admin && steward && <button className="pp-role-inline-action" type="button" onClick={() => setRemoveTarget({ kind: 'steward', id: repoId, label: 'Steward assignment', login: steward.github_login })}>Remove Steward</button>}
    </section>

    {steward && <section className="pp-steward-communication" aria-labelledby="pp-steward-communication-heading"><div className="pp-steward-communication-copy"><h4 id="pp-steward-communication-heading">Discuss with the Steward</h4><p>Start a public GitHub issue so the Steward and repo participants can follow the conversation.</p><small>GitHub sends notifications according to each person's settings. OASIS does not send private messages.</small></div><div className="pp-steward-communication-actions"><a href={discussionUrl} target="_blank" rel="noreferrer">Open a GitHub issue <ExternalLink size={14} /></a></div></section>}

    {!steward && <div className="pp-stewardship-process"><h4>How Security Stewardship is assigned</h4><ol className="pp-stewardship-steps"><li><span className="pp-step-number">1</span><div><strong>Request appointment</strong><p>Request to coordinate OASIS security work on this fork using your linked GitHub account.</p></div></li><li><span className="pp-step-number">2</span><div><strong>OASIS Team review</strong><p>An OASIS administrator reviews your GitHub identity and request.</p></div></li><li><span className="pp-step-number">3</span><div><strong>Assignment</strong><p>The appointed Steward can manage repo-specific OASIS roles. GitHub repository access remains separate.</p></div></li></ol>
      {!viewer.github_user_id ? <a className="pp-request-steward" href="/api/auth/login">Sign in to request Stewardship</a> : requestPending || viewer.open_request_exists ? <div className="pp-stewardship-notice pp-stewardship-notice--pending" role="status"><CircleDashed size={17} /><span>{requestPending ? 'Your request is waiting for OASIS Team review.' : 'A request for this repository is waiting for OASIS Team review.'} Status is shown here; OASIS does not send a separate notification yet.</span></div> : <>{requestDeclined && <div className="pp-stewardship-notice" role="status">Your earlier request was declined. You may submit a new request.</div>}<button type="button" className="pp-request-steward" disabled={working} onClick={() => void mutate(`/api/workspace/repos/${repoId}/management`, {}, 'Stewardship request submitted for OASIS review.')}>Request Stewardship</button></>}
    </div>}

    {viewer.is_admin && viewer.pending_request && <div className="pp-steward-review-card"><div className="pp-steward-review-person"><span className="pp-steward-avatar"><UserRound size={17} /></span><div><strong>{viewer.pending_request.requester_name || viewer.pending_request.requester_login}</strong><a href={githubProfile(viewer.pending_request.requester_login)} target="_blank" rel="noreferrer">@{viewer.pending_request.requester_login} · View GitHub profile ↗</a></div></div><p>Requests appointment as OASIS Repo Security Steward for <strong>{repoFullName}</strong>.</p><div className="pp-steward-review-actions"><button type="button" className="pp-review-decline" disabled={working} onClick={() => void mutate(`/api/workspace/repos/${repoId}/stewardship-requests/${viewer.pending_request!.id}`, { decision: 'decline' }, 'Stewardship request declined.')}>Decline</button><button type="button" className="pp-review-approve" disabled={working} onClick={() => void mutate(`/api/workspace/repos/${repoId}/stewardship-requests/${viewer.pending_request!.id}`, { decision: 'approve' }, 'Security Steward appointed.')}>Appoint Security Steward <ArrowRight size={15} /></button></div></div>}

    {formOpen && <div className="pp-role-remove-backdrop" role="presentation"><form className="pp-steward-management-form" role="dialog" aria-modal="true" aria-labelledby="pp-role-form-title" onSubmit={saveRole}><div className="pp-role-form-heading"><div><strong id="pp-role-form-title">{editing ? 'Edit Repo Role' : 'Assign a Repo Role'}</strong><span>Verify a GitHub account and define its repository responsibility.</span></div><button type="button" aria-label="Close assignment form" onClick={() => setFormOpen(false)}><X size={15} /></button></div><div className="pp-role-form-field"><label htmlFor="pp-new-member-github">GitHub username</label><input id="pp-new-member-github" required value={login} onChange={event => setLogin(event.target.value)} placeholder="octocat" /></div><div className="pp-role-form-field"><label htmlFor="pp-new-member-role">Repo Role</label><input id="pp-new-member-role" required minLength={2} maxLength={80} value={roleName} onChange={event => setRoleName(event.target.value)} placeholder="Fix Editor" /></div><div className="pp-role-form-field pp-role-form-field--wide"><label htmlFor="pp-custom-role-definition">Role description</label><textarea id="pp-custom-role-definition" rows={2} maxLength={500} value={description} onChange={event => setDescription(event.target.value)} placeholder="Describe this person's responsibility" /></div><div className="pp-role-form-footer"><small>Roles describe responsibility only; they do not grant GitHub permissions.</small><button className="pp-steward-management-submit" type="submit" disabled={working}>{editing ? 'Save changes' : 'Assign Repo Role'}</button></div></form></div>}

    {removeTarget && <div className="pp-role-remove-backdrop" role="presentation"><section className="pp-role-remove-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pp-role-remove-title"><h4 id="pp-role-remove-title">{removeTarget.kind === 'steward' ? 'End Steward assignment?' : `Remove ${removeTarget.label}?`}</h4><p>{removeTarget.kind === 'maintainer' ? `This removes @${removeTarget.login} from the OASIS repo roster. Their GitHub repository permissions will not change.` : removeTarget.kind === 'steward' ? 'The Steward assignment will end. Existing Repo Role assignments remain visible, and another person can request appointment.' : `This removes @${removeTarget.login}'s ${removeTarget.label} assignment from the OASIS repo roster.`}</p><div><button type="button" disabled={working} onClick={() => setRemoveTarget(null)}>Cancel</button><button type="button" className="pp-role-remove-confirm" disabled={working} onClick={async () => { const target = removeTarget; const path = target.kind === 'role' ? `/api/workspace/repos/${repoId}/roles/${target.id}` : target.kind === 'maintainer' ? `/api/workspace/repos/${repoId}/maintainers/${target.id}` : `/api/workspace/repos/${repoId}/steward`; if (await mutate(path, { action: 'remove' }, `${target.label} removed from the OASIS roster.`)) setRemoveTarget(null) }}>Confirm</button></div></section></div>}
    {error && <p className="pp-steward-management-notice" role="alert">{error}</p>}{notice && <p className="pp-steward-management-notice" role="status">{notice}</p>}
    <p className="pp-stewardship-footnote">Participation can be reviewed over time. It does not trigger quotas or automatic removal.</p>
  </section>
}
