import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowRight, Check, CircleAlert, GitBranch, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import './maintainer-workspace.css'

type View = 'repositories' | 'fixes'
type FixStatus = 'Ready for review' | 'Selected' | 'Changes requested' | 'Declined' | 'Pending reconciliation' | 'Submitted' | 'Merged' | 'Closed'
type Repo = { id: number; name: string; full_name: string; upstream_url: string | null; language: string | null }
type Connection = { oasis_repo_id: number; oasis_fork: string; upstream_repo_github_id: number; upstream_full_name: string; github_login: string; github_permission: 'maintain' | 'admin'; verified_at: string }
type PR = { id: number; repo_id: number; repo_name: string; number: number; title: string; state: string; html_url: string; head_sha: string | null; oasis_repo_full_name: string; upstream_url: string | null; language: string | null; participants: number; consensus_accept: number; consensus_modify: number; consensus_reject: number; maintainer_decision: 'accepted' | 'declined' | 'changes_requested' | null; maintainer_decision_at: string | null; maintainer_decision_head_sha: string | null; upstream_status: 'pending' | 'open' | 'changes_requested' | 'merged' | 'closed' | 'failed' | null; upstream_head_sha: string | null; upstream_pr_url: string | null }
type Workflow = { status: string; community_ready: boolean; maintainer_decision: { decision: 'accepted' | 'declined' | 'changes_requested'; reason: string; head_sha: string | null; github_login: string; created_at: string } | null; upstream_submission: { status: string; upstream_pr_url: string | null; validated_head_sha: string; error_summary: string | null } | null }
type Participant = { github_login: string; decision: 'accept' | 'modify' | 'reject'; voted_at: string; avatar_url: string | null; reputation: number; prs_worked: number; rank_90d: number | null; profile_synced_at: string | null }
type Evidence = { head_sha: string | null; participants: Participant[]; counts: { accept: number; modify: number; reject: number }; historical_votes_unattributed: boolean; historical_vote_count: number }
const LIFECYCLE: FixStatus[] = ['Ready for review', 'Selected', 'Changes requested', 'Declined', 'Pending reconciliation', 'Submitted', 'Merged', 'Closed']

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', signal })
  const data = await response.json() as T & { ok?: boolean; error?: string }
  if (!response.ok || data.ok === false) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const csrfResponse = await fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
  const csrf = await csrfResponse.json() as { token?: string }
  if (!csrfResponse.ok || !csrf.token) throw new Error('Could not obtain a security token. Refresh and try again.')
  const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf.token }, body: JSON.stringify(body) })
  const data = await response.json() as T & { ok?: boolean; error?: string }
  if (!response.ok || data.ok === false) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

function statusFor(pr: PR): FixStatus {
  const currentSubmission = pr.upstream_head_sha === pr.head_sha
  if (currentSubmission && pr.upstream_status === 'merged') return 'Merged'
  if (currentSubmission && (pr.upstream_status === 'open' || pr.upstream_status === 'changes_requested')) return 'Submitted'
  if (currentSubmission && pr.upstream_status === 'pending') return 'Pending reconciliation'
  if (currentSubmission && (pr.upstream_status === 'closed' || pr.upstream_status === 'failed')) return 'Closed'
  const currentDecision = pr.maintainer_decision_head_sha === pr.head_sha
  if (currentDecision && pr.maintainer_decision === 'accepted') return 'Selected'
  if (currentDecision && pr.maintainer_decision === 'changes_requested') return 'Changes requested'
  if (currentDecision && pr.maintainer_decision === 'declined') return 'Declined'
  return 'Ready for review'
}

function severityFor(title: string): 'High' | 'Medium' | 'Low' | 'Unknown' {
  const match = title.match(/\b(high|medium|low)\s+severity\b/i)
  return match ? (match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()) as 'High' | 'Medium' | 'Low' : 'Unknown'
}

export default function MaintainerWorkspace() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(params.get('view') === 'fixes' ? 'fixes' : 'repositories')
  const [catalog, setCatalog] = useState<Repo[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [prs, setPRs] = useState<PR[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [repoFilter, setRepoFilter] = useState(params.get('repo') ?? 'All repositories')
  const [severityFilter, setSeverityFilter] = useState('Any severity')
  const [activeStatus, setActiveStatus] = useState<FixStatus>(LIFECYCLE.includes(params.get('status') as FixStatus) ? params.get('status') as FixStatus : 'Ready for review')
  const [selectedId, setSelectedId] = useState(Number(params.get('pr')) || 0)
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectRepoId, setConnectRepoId] = useState('')
  const [workflow, setWorkflow] = useState<Workflow | null>(null)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [decision, setDecision] = useState<'changes_requested' | 'declined' | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!user) {
      setCatalog([]); setConnections([]); setPRs([]); setLoading(false); setError(null)
      return
    }
    setLoading(true); setError(null)
    try {
      const [catalogData, connectionData, prData] = await Promise.all([
        getJSON<Repo[]>('/api/workspace/repo-catalog', signal),
        getJSON<{ repositories: Connection[] }>('/api/maintainer/repositories', signal),
        getJSON<PR[]>('/api/workspace/prs', signal),
      ])
      setCatalog(catalogData)
      setConnections(connectionData.repositories ?? [])
      setPRs(prData)
    } catch (caught) {
      if (!signal?.aborted) setError((caught as Error).message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [user])

  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    return () => controller.abort()
  }, [reload, refreshCount])

  const connectedIds = useMemo(() => new Set(connections.map(connection => connection.oasis_repo_id)), [connections])
  const connectedPRs = useMemo(() => prs.filter(pr => connectedIds.has(pr.repo_id)), [prs, connectedIds])
  const repositories = useMemo(() => catalog.filter(repo => connectedIds.has(repo.id)), [catalog, connectedIds])
  const filtered = useMemo(() => connectedPRs.filter(pr => statusFor(pr) === activeStatus &&
    (repoFilter === 'All repositories' || pr.oasis_repo_full_name === repoFilter) &&
    (severityFilter === 'Any severity' || severityFor(pr.title) === severityFilter) &&
    `${pr.repo_name}#${pr.number} ${pr.title} ${pr.oasis_repo_full_name}`.toLowerCase().includes(query.toLowerCase())),
  [connectedPRs, activeStatus, repoFilter, severityFilter, query])
  const selected = filtered.find(pr => pr.id === selectedId) ?? filtered[0]
  const selectedConnection = selected ? connections.find(connection => connection.oasis_repo_id === selected.repo_id) : null
  const selectedDecisionCurrent = selected && workflow?.maintainer_decision?.decision === 'accepted' && workflow.maintainer_decision.head_sha === selected.head_sha

  useEffect(() => {
    const nextView = params.get('view') === 'fixes' ? 'fixes' : 'repositories'
    const nextRepo = params.get('repo') ?? 'All repositories'
    const nextStatus = LIFECYCLE.includes(params.get('status') as FixStatus) ? params.get('status') as FixStatus : 'Ready for review'
    const nextPR = Number(params.get('pr')) || 0
    if (view !== nextView) setView(nextView)
    if (repoFilter !== nextRepo) setRepoFilter(nextRepo)
    if (activeStatus !== nextStatus) setActiveStatus(nextStatus)
    if (selectedId !== nextPR) setSelectedId(nextPR)
  // Search-param changes represent browser back/forward as well as in-app navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (view === 'repositories') next.delete('view'); else next.set('view', view)
    if (repoFilter === 'All repositories') next.delete('repo'); else next.set('repo', repoFilter)
    if (view === 'fixes' && selected) next.set('pr', String(selected.id)); else next.delete('pr')
    if (view === 'fixes') next.set('status', activeStatus); else next.delete('status')
    if (next.toString() !== params.toString()) setParams(next)
  }, [view, selected?.id, repoFilter, activeStatus, params, setParams])

  useEffect(() => {
    if (!selected) { setWorkflow(null); setEvidence(null); return }
    const controller = new AbortController()
    setDetailLoading(true); setDetailError(null); setWorkflow(null); setEvidence(null)
    Promise.all([
      getJSON<Workflow>(`/api/pr-panel/${selected.id}/workflow`, controller.signal),
      getJSON<Evidence>(`/api/pr-panel/${selected.id}/validation-evidence`, controller.signal),
    ]).then(([nextWorkflow, nextEvidence]) => {
      setWorkflow(nextWorkflow); setEvidence(nextEvidence)
    }).catch(caught => { if (!controller.signal.aborted) setDetailError((caught as Error).message) })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false) })
    return () => controller.abort()
  }, [selected?.id, refreshCount])

  useEffect(() => {
    if (!connectOpen && !confirmSubmit) return
    const previous = document.activeElement as HTMLElement | null
    const dialog = document.querySelector<HTMLElement>('.mw-modal-backdrop [role="dialog"]')
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ?? []).filter(node => node.getClientRects().length)
    focusable()[0]?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setConnectOpen(false); setConfirmSubmit(false)
      } else if (event.key === 'Tab') {
        const nodes = focusable()
        if (!nodes.length) return
        const first = nodes[0], last = nodes[nodes.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [connectOpen, confirmSubmit])

  async function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!connectRepoId) return
    setWorking(true); setError(null); setNotice('')
    try {
      const result = await postJSON<{ repository: Connection }>('/api/maintainer/repositories', { oasis_repo_id: Number(connectRepoId) })
      setConnections(current => [...current.filter(item => item.oasis_repo_id !== result.repository.oasis_repo_id), result.repository])
      setConnectOpen(false); setConnectRepoId('')
      setNotice(`Connected ${result.repository.oasis_fork}. GitHub verified ${result.repository.github_permission} access.`)
    } catch (caught) { setError((caught as Error).message) }
    finally { setWorking(false) }
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected || !decision || !reason.trim()) return
    setWorking(true); setError(null)
    try {
      const result = await postJSON<Workflow>(`/api/pr-panel/${selected.id}/maintainer-decision`, { decision, reason: reason.trim() })
      setWorkflow(result); setReason(''); setDecision(null); setNotice(`${selected.repo_name}#${selected.number}: ${result.status}.`)
      setRefreshCount(count => count + 1)
    } catch (caught) { setError((caught as Error).message) }
    finally { setWorking(false) }
  }

  async function submitUpstream() {
    if (!selected) return
    setWorking(true); setError(null)
    try {
      const result = await postJSON<Workflow>(`/api/pr-panel/${selected.id}/submit-upstream`, { confirm: true })
      setWorkflow(result); setConfirmSubmit(false); setNotice(`${selected.repo_name}#${selected.number}: ${result.status}.`)
      setRefreshCount(count => count + 1)
    } catch (caught) { setError((caught as Error).message) }
    finally { setWorking(false) }
  }

  function openFixes(repository: Repo) {
    setView('fixes'); setRepoFilter(repository.full_name); setActiveStatus('Ready for review'); setNotice('')
  }

  const waitingCount = connectedPRs.filter(pr => ['Ready for review', 'Selected', 'Changes requested'].includes(statusFor(pr))).length
  const countFor = (status: FixStatus) => connectedPRs.filter(pr => statusFor(pr) === status).length

  return <main className="mw-mockup" aria-label="Maintainer workspace">
    <div className="mw-heading"><div><span className="mw-eyebrow"><ShieldCheck size={14} /> OASIS maintainer workspace</span><h2>Repository work and validated fixes</h2><p>Connect repositories you maintain, review OASIS candidate fixes, and follow each upstream handoff.</p></div></div>
    <div className="mw-view-tabs" role="tablist" aria-label="Maintainer workspace views">
      <button role="tab" aria-selected={view === 'repositories'} onClick={() => { setView('repositories'); setNotice('') }}>My repositories</button>
      <button role="tab" aria-selected={view === 'fixes'} onClick={() => { setView('fixes'); setNotice('') }}>Available fixes <span>{waitingCount}</span></button>
    </div>
    {error && <div className="mw-notice is-error" role="alert"><CircleAlert size={16} />{error}<button className="mw-text-button" onClick={() => setRefreshCount(value => value + 1)}>Retry</button></div>}
    {notice && <div className="mw-notice" role="status"><Check size={16} />{notice}</div>}
    {!user ? <section className="mw-empty-state"><h3>Sign in with GitHub</h3><p>Connect a repository after OASIS verifies your Maintain or Admin access.</p></section> : loading ? <div className="mw-loading" role="status">Loading your repositories and candidate fixes…</div> : view === 'repositories' ? <section className="mw-repositories" aria-labelledby="mw-repositories-title">
      <div className="mw-section-heading"><div><h3 id="mw-repositories-title">My repositories</h3><p>GitHub verifies Maintain or Admin access when you connect and again before consequential actions.</p></div><button className="mw-primary" onClick={() => { setConnectOpen(true); setError(null) }}><GitBranch size={15} /> Connect a repository</button></div>
      <div className="mw-counts"><span><b>{repositories.length}</b> connected</span><span><b>{waitingCount}</b> candidate fixes waiting</span></div>
      {repositories.length ? <div className="mw-table-wrap"><table className="mw-repo-table"><thead><tr><th>OASIS repository</th><th>Upstream maintainer role</th><th>Candidate fixes</th><th>Action</th></tr></thead><tbody>{repositories.map(repo => { const connection = connections.find(item => item.oasis_repo_id === repo.id)!; const count = connectedPRs.filter(pr => pr.repo_id === repo.id && ['Ready for review', 'Selected', 'Changes requested'].includes(statusFor(pr))).length; return <tr key={repo.id}><td><strong>{repo.full_name}</strong><small>{repo.upstream_url ?? 'No upstream configured'}</small></td><td><span className="mw-role-badge">{connection.github_permission} · verified {new Date(connection.verified_at).toLocaleDateString()}</span></td><td>{count ? `${count} waiting` : '—'}</td><td><button className="mw-text-button" onClick={() => openFixes(repo)}>View fixes <ArrowRight size={13} /></button></td></tr> })}</tbody></table></div> : <div className="mw-empty-state"><h3>No repositories connected</h3><p>Connect an OASIS fork you maintain. GitHub will verify your role on its configured upstream; this works even before a Repo Security Steward is appointed.</p><button className="mw-primary" onClick={() => setConnectOpen(true)}><GitBranch size={15} /> Connect a repository</button></div>}
      <div className="mw-repo-note"><ShieldCheck size={17} /><div><strong>GitHub access stays in your control</strong><p>OASIS checks your repository role before decisions and upstream submissions. It never pushes to your branches, submits without your click, or merges a pull request.</p></div></div>
      {connectOpen && <div className="mw-modal-backdrop" role="presentation" onClick={() => setConnectOpen(false)}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="mw-connect-title" onClick={event => event.stopPropagation()}><button className="mw-modal-close" aria-label="Close" onClick={() => setConnectOpen(false)}><X size={17} /></button><span className="mw-eyebrow"><GitBranch size={14} /> GitHub verification</span><h3 id="mw-connect-title">Connect an OASIS repository</h3><p>Choose the fork. OASIS checks your GitHub Maintain or Admin role on the configured upstream repository.</p><form onSubmit={connectRepository}><label htmlFor="mw-repo-select">OASIS repository</label><select id="mw-repo-select" required value={connectRepoId} onChange={event => setConnectRepoId(event.target.value)}><option value="">Choose a repository</option>{catalog.filter(repo => repo.upstream_url).map(repo => <option value={repo.id} key={repo.id}>{repo.full_name} → {repo.upstream_url}</option>)}</select>{!catalog.some(repo => repo.upstream_url) && <small>No OASIS repositories with an upstream are available.</small>}<button className="mw-primary" type="submit" disabled={working || !connectRepoId}>Verify with GitHub <ArrowRight size={15} /></button></form></section></div>}
    </section> : <section className="mw-fixes" aria-labelledby="mw-fixes-title">
      <div className="mw-section-heading"><div><h3 id="mw-fixes-title">Available fixes</h3><p>Review the evidence and exact revision. Approval records your decision; it does not create a pull request.</p></div><button className="mw-secondary" onClick={() => { setRepoFilter('All repositories'); setQuery(''); setSeverityFilter('Any severity') }}><ArrowDownToLine size={14} /> Clear filters</button></div>
      <div className="mw-lifecycle" role="tablist" aria-label="Fix lifecycle">{LIFECYCLE.map(status => <button role="tab" key={status} aria-selected={activeStatus === status} onClick={() => { setActiveStatus(status); setNotice(''); setDecision(null) }}>{status}<span>{countFor(status)}</span></button>)}</div>
      <div className="mw-filter-row"><label className="mw-search"><Search size={15} /><input aria-label="Search fixes" placeholder="Search repository, PR, or title" value={query} onChange={event => setQuery(event.target.value)} /></label><label>Repository<select value={repoFilter} onChange={event => setRepoFilter(event.target.value)}><option>All repositories</option>{repositories.map(repo => <option key={repo.id} value={repo.full_name}>{repo.full_name}</option>)}</select></label><label>Severity<select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option>Any severity</option><option>High</option><option>Medium</option><option>Low</option><option>Unknown</option></select></label></div>
      {detailError && <div className="mw-notice is-error" role="alert">{detailError}<button className="mw-text-button" onClick={() => setRefreshCount(value => value + 1)}>Retry</button></div>}
      <div className="mw-fix-layout"><div className="mw-fix-list" aria-label="Candidate fixes">{filtered.length ? filtered.map(pr => <button className={`mw-fix-card ${pr.id === selected?.id ? 'is-selected' : ''}`} key={pr.id} onClick={() => { setSelectedId(pr.id); setDecision(null); setReason(''); setNotice('') }}><span className={`mw-severity mw-severity--${severityFor(pr.title).toLowerCase()}`}>{severityFor(pr.title)}</span><span className="mw-fix-card-copy"><strong>{pr.repo_name}#{pr.number} · {pr.oasis_repo_full_name}</strong><span>{pr.title}</span><small>{pr.participants} validators · {statusFor(pr)}</small></span><ArrowRight size={14} /></button>) : <p className="mw-empty">{connectedPRs.length ? 'No fixes in this view match these filters.' : 'Connect a repository you maintain to see its OASIS candidate fixes.'}</p>}</div>
        {selected && <article className="mw-fix-detail"><div className="mw-detail-meta"><a href={selected.html_url} target="_blank" rel="noreferrer">{selected.repo_name}#{selected.number}</a><span>{selected.oasis_repo_full_name}</span><span>{selected.language ?? 'Language unknown'}</span></div><h4>{selected.title}</h4><p>OASIS validation is shown for the current candidate revision. The source pull request is the canonical discussion for this fix.</p><div className="mw-evidence"><div><span>Validation</span><strong>{selected.consensus_accept} accept · {selected.consensus_modify} modify · {selected.consensus_reject} reject</strong></div><div><span>Current revision</span><strong>{selected.head_sha ?? 'Not available'}</strong></div><div><span>Maintainer workflow</span><strong>{workflow?.status ?? statusFor(selected)}</strong></div></div>
          <section className="mw-validation-panel" aria-labelledby="mw-validation-title"><div className="mw-validation-heading"><div><span className="mw-section-kicker">OASIS validation record</span><h5 id="mw-validation-title">Validation participants</h5><p>Only votes stored against this exact GitHub revision are listed. Current OASIS profile metrics provide context, not a prediction of correctness.</p></div><span className="mw-validation-total">{evidence?.participants.length ?? 0} participants</span></div>
            {detailLoading ? <p role="status">Loading current revision and validator record…</p> : evidence ? <><div className="mw-validation-counts" aria-label="Exact revision vote summary"><span><b>{evidence.counts.accept}</b> Accept</span><span><b>{evidence.counts.modify}</b> Modify</span><span><b>{evidence.counts.reject}</b> Reject</span></div><div className="mw-validator-list">{evidence.participants.map(participant => <article className="mw-validator-entry" key={participant.github_login}><img className="mw-validator-avatar" src={participant.avatar_url ?? `https://github.com/${participant.github_login}.png?size=32`} alt="" /><div className="mw-validator-main"><div className="mw-validator-topline"><a href={`https://github.com/${participant.github_login}`} target="_blank" rel="noreferrer">@{participant.github_login}</a><span className={`mw-validator-vote mw-validator-vote--${participant.decision}`}>{participant.decision}</span></div><div className="mw-validator-signals"><span>OASIS reputation <b>{participant.reputation.toFixed(1)}</b></span><span>{participant.prs_worked} fixes reviewed</span><span>90-day rank {participant.rank_90d ? `#${participant.rank_90d}` : '—'}</span></div></div></article>)}</div>{evidence.historical_votes_unattributed && <p className="mw-validation-demo-note">{evidence.historical_vote_count} earlier vote{evidence.historical_vote_count === 1 ? '' : 's'} cannot be tied to an exact revision and are excluded from this list. Profile figures reflect the latest OASIS contributor sync.</p>}{evidence.participants.some(person => !person.profile_synced_at) && <p className="mw-validation-demo-note">Some contributor profile metrics have not been synced.</p>}</> : <p>No exact-revision validation record is available.</p>}</section>
          {workflow?.maintainer_decision && <div className="mw-change-history"><strong>{workflow.maintainer_decision.decision.replace('_', ' ')} · {workflow.maintainer_decision.github_login}</strong><p>{workflow.maintainer_decision.reason}</p></div>}
          {selected.upstream_status === 'open' && selected.upstream_pr_url ? <div className="mw-upstream-state"><span>Upstream pull request</span><strong><a href={selected.upstream_pr_url} target="_blank" rel="noreferrer">Open in GitHub <ArrowRight size={13} /></a></strong></div> : selected.upstream_status === 'pending' ? <div className="mw-notice" role="status"><CircleAlert size={15} />GitHub submission is being reconciled. OASIS will not retry creation until it confirms whether a PR exists.</div> : null}
          {workflow?.upstream_submission?.error_summary && <div className="mw-notice is-error" role="alert">{workflow.upstream_submission.error_summary}</div>}
          {selected.state === 'open' && selected.head_sha && selectedConnection && !['pending', 'open', 'changes_requested'].includes(selected.upstream_status ?? '') && <><div className="mw-readiness"><span className="mw-step is-done">1 Review</span><span className={`mw-step ${selectedDecisionCurrent ? 'is-done' : ''}`}>2 Approve revision</span><span className="mw-step">3 Create upstream PR</span><span className="mw-step">4 Track in GitHub</span></div>
            {selectedDecisionCurrent ? <><div className="mw-approved-note"><Check size={15} /><span>This exact revision is accepted. Approval does not create a PR.</span></div><button className="mw-primary" onClick={() => setConfirmSubmit(true)} disabled={working}>Create upstream PR <ArrowRight size={15} /></button></> : <><div className="mw-detail-actions"><button className="mw-primary" disabled={working || !evidence?.head_sha || evidence.head_sha !== selected.head_sha} onClick={async () => { setWorking(true); setError(null); try { const result = await postJSON<Workflow>(`/api/pr-panel/${selected.id}/maintainer-decision`, { decision: 'accepted', reason: 'Accepted for upstream review.' }); setWorkflow(result); setRefreshCount(value => value + 1) } catch (caught) { setError((caught as Error).message) } finally { setWorking(false) }}}><Check size={15} /> Approve current revision</button><button className="mw-secondary" onClick={() => setDecision('changes_requested')}>Request changes</button><button className="mw-danger" onClick={() => setDecision('declined')}>Decline…</button></div>{decision && <form className="mw-decline-form" onSubmit={submitDecision}><div><strong>{decision === 'declined' ? 'Why are you declining this fix?' : 'What should change?'}</strong><button type="button" aria-label="Close form" onClick={() => { setDecision(null); setReason('') }}><X size={15} /></button></div><p>Your reason is recorded with the current revision. It is not automatically posted as a GitHub comment.</p><textarea required minLength={10} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain your decision (at least 10 characters)." /><button className={decision === 'declined' ? 'mw-danger-submit' : 'mw-primary'} type="submit" disabled={working || reason.trim().length < 10}>{decision === 'declined' ? 'Record decline' : 'Request changes'}</button></form>}</>}
          </>}
          {confirmSubmit && <div className="mw-modal-backdrop" role="presentation" onClick={() => setConfirmSubmit(false)}><section className="mw-pr-confirm" role="dialog" aria-modal="true" aria-labelledby="mw-submit-title" onClick={event => event.stopPropagation()}><div><strong id="mw-submit-title">Create an upstream pull request?</strong><button aria-label="Close confirmation" onClick={() => setConfirmSubmit(false)}><X size={15} /></button></div><p><b>Source:</b> <a href={selected.html_url} target="_blank" rel="noreferrer">{selected.repo_name}#{selected.number}</a> · {selected.head_sha}</p><p><b>Destination:</b> {selected.upstream_url}</p><p>GitHub will open a pull request for normal project review. OASIS will not merge it.</p><button className="mw-primary" onClick={() => void submitUpstream()} disabled={working}>Confirm and create PR <ArrowRight size={15} /></button></section></div>}
          <details className="mw-provenance"><summary>Candidate details</summary><p>Candidate fix and discussion are maintained on the OASIS source pull request. Review the source PR for the full description and code changes.</p></details>
        </article>}
      </div>
    </section>}
    <p className="mw-footnote"><CircleAlert size={13} /> GitHub controls repository access, PR discussion, checks, and merge. OASIS records the maintainer decision and links the upstream outcome.</p>
  </main>
}
