import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownToLine, ArrowRight, Check, CircleAlert, GitBranch, Search, ShieldCheck, X } from 'lucide-react'
import './maintainer-workspace.css'

type View = 'repositories' | 'fixes'
type FixStatus = 'Ready for review' | 'Selected' | 'Changes requested' | 'Submitted' | 'Merged' | 'Declined'
type CandidateFix = { id: string; repo: string; title: string; severity: 'High' | 'Medium'; cwe: string; status: FixStatus; trust: boolean; votes: string; revision: string; sha: string; summary: string }
type DecisionTarget = { fixId: string; revision: string; sha: string }
type ValidationParticipant = { login: string; reputation: number; fixesReviewed: number; rank90d: number | null; priorVotes: { accept: number; modify: number; reject: number }; rationale?: string }

const initialFixes: CandidateFix[] = [
  { id: 'OF-2184', repo: 'tidewater/jsonpath-lite', title: 'Prevent prototype pollution when assigning through a path', severity: 'High', cwe: 'CWE-1321', status: 'Ready for review', trust: true, votes: '12 accept · 2 modify · 0 reject', revision: 'r2', sha: 'a3f9c1e', summary: 'assignPath() creates intermediate objects without checking path keys. Rejecting unsafe keys prevents writes through __proto__, constructor and prototype.' },
  { id: 'OF-2177', repo: 'tidewater/quill-parser', title: 'Limit nested block depth to prevent stack exhaustion', severity: 'High', cwe: 'CWE-674', status: 'Ready for review', trust: true, votes: '11 accept · 1 modify · 0 reject', revision: 'r1', sha: '12be884', summary: 'Deeply nested input can exhaust the parser stack. The proposed depth limit rejects excessive nesting with a typed parse error.' },
  { id: 'OF-2191', repo: 'tidewater/jsonpath-lite', title: 'Bound recursion depth in the filter expression evaluator', severity: 'Medium', cwe: 'CWE-674', status: 'Changes requested', trust: false, votes: '6 accept · 1 modify · 0 reject', revision: 'r1', sha: '6c2d13a', summary: 'Recursive filter expressions can run for an unbounded time. Validation is still below the standard OASIS trust threshold.' },
  { id: 'OF-2120', repo: 'tidewater/jsonpath-lite', title: 'Reject unquoted script keys in bracket notation', severity: 'High', cwe: 'CWE-1321', status: 'Submitted', trust: true, votes: '13 accept · 2 modify · 0 reject', revision: 'r2', sha: '0e7d3b1', summary: 'The selected revision is in an upstream pull request. GitHub owns discussion, checks, and merge.' },
  { id: 'OF-2098', repo: 'tidewater/jsonpath-lite', title: 'Remove catastrophic backtracking from ISO date regex', severity: 'Medium', cwe: 'CWE-1333', status: 'Merged', trust: true, votes: '10 accept · 1 modify · 0 reject', revision: 'r3', sha: '8fc4410', summary: 'The upstream pull request was merged. OASIS records the outcome against this fix.' },
  { id: 'OF-2105', repo: 'tidewater/quill-parser', title: 'Handle malformed escape sequences safely', severity: 'Medium', cwe: 'CWE-116', status: 'Declined', trust: true, votes: '10 accept · 0 modify · 1 reject', revision: 'r1', sha: 'be31d90', summary: 'The maintainer declined this proposal with a recorded explanation.' },
]

const repoRows = [
  { name: 'tidewater/jsonpath-lite', language: 'JavaScript', role: 'Admin', connection: 'Connected', branch: 'main' },
  { name: 'tidewater/quill-parser', language: 'Rust', role: 'Maintain', connection: 'Connected', branch: 'develop' },
  { name: 'harborlabs/pg-sentry', language: 'Go', role: 'Maintain', connection: 'Disconnected', branch: 'main' },
  { name: 'ferncloud/imgshrink', language: 'Python', role: 'Triage', connection: 'Needs Maintain or Admin', branch: '—' },
]

const lifecycle: FixStatus[] = ['Ready for review', 'Selected', 'Changes requested', 'Submitted', 'Merged', 'Declined']
const waitingStatuses: FixStatus[] = ['Ready for review', 'Selected', 'Changes requested']
const demoValidatorProfiles: ValidationParticipant[] = [
  { login: 'mira-sec-demo', reputation: 48.6, fixesReviewed: 9, rank90d: 3, priorVotes: { accept: 17, modify: 4, reject: 1 } },
  { login: 'devon-review-demo', reputation: 34.8, fixesReviewed: 7, rank90d: 8, priorVotes: { accept: 10, modify: 5, reject: 3 } },
  { login: 'lin-appsec-demo', reputation: 41.2, fixesReviewed: 8, rank90d: 5, priorVotes: { accept: 15, modify: 3, reject: 2 } },
  { login: 'noah-oss-demo', reputation: 22.7, fixesReviewed: 5, rank90d: 17, priorVotes: { accept: 6, modify: 5, reject: 2 } },
  { login: 'samira-code-demo', reputation: 29.4, fixesReviewed: 6, rank90d: 11, priorVotes: { accept: 9, modify: 2, reject: 1 } },
  { login: 'riley-sec-demo', reputation: 18.9, fixesReviewed: 4, rank90d: 24, priorVotes: { accept: 4, modify: 3, reject: 1 } },
  { login: 'kai-review-demo', reputation: 24.1, fixesReviewed: 5, rank90d: 15, priorVotes: { accept: 7, modify: 4, reject: 2 } },
  { login: 'ana-oss-demo', reputation: 16.3, fixesReviewed: 3, rank90d: 31, priorVotes: { accept: 3, modify: 2, reject: 1 } },
  { login: 'jules-sec-demo', reputation: 37.5, fixesReviewed: 8, rank90d: 6, priorVotes: { accept: 12, modify: 4, reject: 1 } },
  { login: 'taylor-appsec-demo', reputation: 12.8, fixesReviewed: 2, rank90d: null, priorVotes: { accept: 2, modify: 1, reject: 0 } },
  { login: 'elliot-review-demo', reputation: 27.2, fixesReviewed: 6, rank90d: 13, priorVotes: { accept: 8, modify: 4, reject: 2 } },
  { login: 'casey-sec-demo', reputation: 20.5, fixesReviewed: 4, rank90d: 21, priorVotes: { accept: 5, modify: 3, reject: 1 } },
  { login: 'niko-oss-demo', reputation: 31.6, fixesReviewed: 7, rank90d: 10, priorVotes: { accept: 11, modify: 3, reject: 1 }, rationale: 'Add a regression case for escaped bracket input.' },
  { login: 'ari-validator-demo', reputation: 14.7, fixesReviewed: 3, rank90d: 36, priorVotes: { accept: 3, modify: 2, reject: 1 }, rationale: 'Please cover malformed unicode escapes before upstream submission.' },
  { login: 'rowan-code-demo', reputation: 9.8, fixesReviewed: 1, rank90d: null, priorVotes: { accept: 1, modify: 0, reject: 0 } },
]

function validationParticipantsFor(fix: CandidateFix) {
  const [accept, modify, reject] = (fix.votes.match(/\d+/g) ?? []).map(Number)
  const total = accept + modify + reject
  return demoValidatorProfiles.slice(0, total).map((participant, index) => ({
    ...participant,
    vote: index < accept ? 'Accept' : index < accept + modify ? 'Modify' : 'Reject',
    rationale: index >= accept && index < accept + modify ? participant.rationale : undefined,
  }))
}

function participantInitials(login: string) {
  return login.split('-').slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('')
}

export default function MaintainerWorkspaceMockup() {
  const [params] = useSearchParams()
  const [view, setView] = useState<View>(params.get('view') === 'fixes' ? 'fixes' : 'repositories')
  const [fixes, setFixes] = useState(initialFixes)
  const [selectedId, setSelectedId] = useState('OF-2184')
  const [activeStatus, setActiveStatus] = useState<FixStatus>('Ready for review')
  const [query, setQuery] = useState('')
  const [repoFilter, setRepoFilter] = useState(params.get('repo') ?? 'All repositories')
  const [severityFilter, setSeverityFilter] = useState('Any severity')
  const [notice, setNotice] = useState('')
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [declineNotes, setDeclineNotes] = useState<Record<string, string>>({})
  const [changeRequestOpen, setChangeRequestOpen] = useState(false)
  const [changeReason, setChangeReason] = useState('')
  const [decisionTarget, setDecisionTarget] = useState<DecisionTarget | null>(null)
  const [changeNotes, setChangeNotes] = useState<Record<string, string>>({})
  const [connectOpen, setConnectOpen] = useState(false)
  const [repositoryUrl, setRepositoryUrl] = useState('')
  const [connectionState, setConnectionState] = useState('')
  const [createPrOpen, setCreatePrOpen] = useState(false)
  const [showAllParticipants, setShowAllParticipants] = useState(false)
  const shownFixes = useMemo(() => fixes.filter(fix => fix.status === activeStatus && (repoFilter === 'All repositories' || fix.repo === repoFilter) && (severityFilter === 'Any severity' || fix.severity === severityFilter) && `${fix.id} ${fix.title} ${fix.repo} ${fix.cwe}`.toLowerCase().includes(query.toLowerCase())), [fixes, activeStatus, repoFilter, severityFilter, query])
  const selectedFix = shownFixes.find(fix => fix.id === selectedId) ?? shownFixes[0]
  const validationParticipants = selectedFix ? validationParticipantsFor(selectedFix) : []
  const validationCounts = validationParticipants.reduce((counts, participant) => {
    const key = participant.vote.toLowerCase() as 'accept' | 'modify' | 'reject'
    counts[key] += 1
    return counts
  }, { accept: 0, modify: 0, reject: 0 })
  useEffect(() => {
    if (selectedFix && selectedFix.id !== selectedId) setSelectedId(selectedFix.id)
  }, [selectedFix?.id, selectedId])
  const waitingFixCount = fixes.filter(fix => waitingStatuses.includes(fix.status)).length
  const connectionCount = {
    connected: repoRows.filter(row => row.connection === 'Connected').length,
    disconnected: repoRows.filter(row => row.connection === 'Disconnected').length,
    needsHigherRole: repoRows.filter(row => row.connection === 'Needs Maintain or Admin').length,
  }

  function updateSelected(change: Partial<CandidateFix>, message: string) {
    setFixes(current => current.map(fix => fix.id === selectedId ? { ...fix, ...change } : fix))
    setNotice(message)
  }

  function submitDecline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (declineReason.trim().length < 10 || !decisionTarget) return
    setDeclineNotes(current => ({ ...current, [decisionTarget.fixId]: declineReason.trim() }))
    setFixes(current => current.map(fix => fix.id === decisionTarget.fixId && fix.revision === decisionTarget.revision && fix.sha === decisionTarget.sha ? { ...fix, status: 'Declined' } : fix))
    setNotice(`Decline recorded for ${decisionTarget.fixId} · ${decisionTarget.revision}.`)
    setActiveStatus('Declined')
    setDeclineOpen(false)
    setDeclineReason('')
  }

  function submitChangeRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (changeReason.trim().length < 10 || !decisionTarget) return
    setChangeNotes(current => ({ ...current, [decisionTarget.fixId]: changeReason.trim() }))
    setFixes(current => current.map(fix => fix.id === decisionTarget.fixId && fix.revision === decisionTarget.revision && fix.sha === decisionTarget.sha ? { ...fix, status: 'Changes requested' } : fix))
    setNotice(`Changes requested on ${decisionTarget.fixId} · ${decisionTarget.revision}.`)
    setActiveStatus('Changes requested')
    setChangeRequestOpen(false)
    setChangeReason('')
  }

  function connectRepository(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!repositoryUrl.trim()) return
    setConnectionState('GitHub verification preview: connect only if GitHub confirms Maintain or Admin access to the upstream repository.')
    setConnectOpen(false)
  }

  function createUpstreamPr() {
    updateSelected({ status: 'Submitted' }, `${selectedFix.id} ${selectedFix.revision} is now shown as submitted in this preview. No GitHub PR was created.`)
    setActiveStatus('Submitted')
    setCreatePrOpen(false)
  }

  return <main className="mw-mockup" aria-label="Maintainer workspace mockup">
    <div className="mw-heading">
      <div><span className="mw-eyebrow"><ShieldCheck size={14} /> OASIS maintainer workspace <span className="mw-demo-label">Demo preview</span></span><h2>Repository work and validated fixes</h2><p>Connect repositories you maintain, review OASIS candidate fixes, and follow each upstream handoff.</p></div>
    </div>
    <div className="mw-view-tabs" role="tablist" aria-label="Maintainer workspace">
      <button role="tab" aria-selected={view === 'repositories'} onClick={() => { setView('repositories'); setNotice('') }}>My repositories</button>
      <button role="tab" aria-selected={view === 'fixes'} onClick={() => { setView('fixes'); setNotice('') }}>Available fixes <span>{waitingFixCount}</span></button>
    </div>

    {view === 'repositories' ? <section className="mw-repositories" aria-labelledby="mw-repositories-title">
      <div className="mw-section-heading"><div><h3 id="mw-repositories-title">My repositories</h3><p>GitHub verifies your role when you connect and again before an upstream PR is created.</p></div><button className="mw-primary" onClick={() => { setConnectOpen(true); setConnectionState('') }}><GitBranch size={15} /> Connect a repository</button></div>
      <div className="mw-counts"><span><b>{connectionCount.connected}</b> connected</span><span><b>{connectionCount.disconnected}</b> disconnected</span><span><b>{connectionCount.needsHigherRole}</b> needs higher role</span><span><b>{waitingFixCount}</b> candidate fixes waiting</span></div>
      {connectionState && <div className="mw-notice" role="status"><ShieldCheck size={16} />{connectionState}</div>}
      <div className="mw-table-wrap"><table className="mw-repo-table"><thead><tr><th>Repository</th><th>Your GitHub role</th><th>Connection</th><th>Target branch</th><th>Candidate fixes</th><th>Action</th></tr></thead><tbody>{repoRows.map(row => { const rowFixCount = fixes.filter(fix => fix.repo === row.name && waitingStatuses.includes(fix.status)).length; return <tr key={row.name}><td><strong>{row.name}</strong><small>{row.language}</small></td><td><span className={`mw-role-badge ${row.role === 'Triage' ? 'is-blocked' : ''}`}>{row.role}{row.role !== 'Triage' && ' · verified today'}</span></td><td><span className={`mw-connection ${row.connection === 'Connected' ? 'is-connected' : row.connection === 'Disconnected' ? 'is-disconnected' : 'is-blocked'}`}>{row.connection}</span></td><td>{row.branch}</td><td>{rowFixCount ? `${rowFixCount} waiting` : '—'}</td><td>{row.connection === 'Connected' ? <button className="mw-text-button" onClick={() => { setView('fixes'); setRepoFilter(row.name); setNotice('') }}>View fixes <ArrowRight size={13} /></button> : row.connection === 'Disconnected' ? <button className="mw-text-button" onClick={() => setConnectionState(`Reconnect ${row.name} through GitHub to resume upstream actions.`)}>Reconnect</button> : <span className="mw-muted">Needs Maintain or Admin</span>}</td></tr> })}</tbody></table></div>
      <div className="mw-repo-note"><ShieldCheck size={17} /><div><strong>GitHub access stays in your control</strong><p>OASIS checks your repository role. It never pushes to your branches, submits without your click, or merges a pull request.</p></div></div>
      {connectOpen && <div className="mw-modal-backdrop" role="presentation" onClick={() => setConnectOpen(false)}><section className="mw-modal" role="dialog" aria-modal="true" aria-labelledby="mw-connect-title" onClick={event => event.stopPropagation()}><button className="mw-modal-close" aria-label="Close" onClick={() => setConnectOpen(false)}><X size={17} /></button><span className="mw-eyebrow"><GitBranch size={14} /> GitHub connection</span><h3 id="mw-connect-title">Connect a repository you maintain</h3><p>Enter the upstream repository. GitHub will verify that your account has Maintain or Admin access before OASIS connects it.</p><form onSubmit={connectRepository}><label htmlFor="mw-repo-url">Upstream repository URL</label><input id="mw-repo-url" type="url" required placeholder="https://github.com/owner/repository" value={repositoryUrl} onChange={event => setRepositoryUrl(event.target.value)} /><div className="mw-permission-hint"><ShieldCheck size={15} /> Required: Maintain or Admin on GitHub</div><button className="mw-primary" type="submit">Continue with GitHub <ArrowRight size={15} /></button><small>Preview only · no connection is created.</small></form></section></div>}
    </section> : <section className="mw-fixes" aria-labelledby="mw-fixes-title">
      <div className="mw-section-heading"><div><h3 id="mw-fixes-title">Available fixes</h3><p>Review the evidence and exact revision. Approval records your decision; it does not create a pull request.</p></div><button className="mw-secondary" onClick={() => { setRepoFilter('All repositories'); setQuery(''); setSeverityFilter('Any severity') }}><ArrowDownToLine size={14} /> Clear filters</button></div>
      <div className="mw-lifecycle" role="tablist" aria-label="Fix lifecycle">{lifecycle.map(status => <button role="tab" key={status} aria-selected={activeStatus === status} onClick={() => { setActiveStatus(status); setNotice('') }}>{status}<span>{fixes.filter(fix => fix.status === status).length}</span></button>)}</div>
      <div className="mw-filter-row"><label className="mw-search"><Search size={15} /><input aria-label="Search fixes" placeholder="Search ID, title, or CWE" value={query} onChange={event => setQuery(event.target.value)} /></label><label>Repository<select value={repoFilter} onChange={event => setRepoFilter(event.target.value)}><option>All repositories</option>{Array.from(new Set(fixes.map(fix => fix.repo))).map(repo => <option key={repo}>{repo}</option>)}</select></label><label>Severity<select value={severityFilter} onChange={event => setSeverityFilter(event.target.value)}><option>Any severity</option><option>High</option><option>Medium</option></select></label></div>
      {notice && <div className="mw-notice" role="status"><Check size={16} />{notice}</div>}
      <div className="mw-fix-layout"><div className="mw-fix-list" aria-label="Candidate fixes">{shownFixes.length ? shownFixes.map(fix => <button className={`mw-fix-card ${fix.id === selectedFix?.id ? 'is-selected' : ''}`} key={fix.id} onClick={() => { setSelectedId(fix.id); setShowAllParticipants(false); setDeclineOpen(false); setChangeRequestOpen(false); setDecisionTarget(null); setNotice('') }}><span className={`mw-severity mw-severity--${fix.severity.toLowerCase()}`}>{fix.severity}</span><span className="mw-fix-card-copy"><strong>{fix.id} · {fix.repo}</strong><span>{fix.title}</span><small>{fix.trust ? 'OASIS TRUSTED' : 'NOT TRUSTED YET'} · {fix.status}</small></span><ArrowRight size={14} /></button>) : <p className="mw-empty">No fixes in this view match these filters.</p>}</div>
        {selectedFix && <article className="mw-fix-detail"><div className="mw-detail-meta"><span>{selectedFix.id}</span><span>{selectedFix.repo}</span><span>{selectedFix.cwe}</span></div><h4>{selectedFix.title}</h4><p>{selectedFix.summary}</p><div className="mw-evidence"><div><span>OASIS trust</span><strong className={selectedFix.trust ? 'is-trusted' : 'is-untrusted'}>{selectedFix.trust ? 'Trusted' : 'Not trusted yet'}</strong></div><div><span>Validation</span><strong>{selectedFix.votes}</strong></div><div><span>Reviewed revision</span><strong>{selectedFix.revision} · {selectedFix.sha}</strong></div></div>
          <section className="mw-validation-panel" aria-labelledby="mw-validation-title">
            <div className="mw-validation-heading"><div><span className="mw-section-kicker">OASIS validation record · demo data</span><h5 id="mw-validation-title">Validation participants</h5><p>These people reviewed {selectedFix.revision} ({selectedFix.sha}). Their prior OASIS record is available to inform your decision.</p></div><span className="mw-validation-total">{validationParticipants.length} participants</span></div>
            <div className="mw-validation-counts" aria-label="Vote summary"><span><b>{validationCounts.accept}</b> Accept</span><span><b>{validationCounts.modify}</b> Modify</span><span><b>{validationCounts.reject}</b> Reject</span></div>
            <div className="mw-validator-list">{(showAllParticipants ? validationParticipants : validationParticipants.slice(0, 4)).map(participant => <article className="mw-validator-entry" key={participant.login}>
              <span className="mw-validator-avatar" aria-hidden="true">{participantInitials(participant.login)}</span>
              <div className="mw-validator-main"><div className="mw-validator-topline"><strong>@{participant.login}</strong><span className={`mw-validator-vote mw-validator-vote--${participant.vote.toLowerCase()}`}>{participant.vote}</span></div><div className="mw-validator-signals"><span>OASIS reputation <b>{participant.reputation.toFixed(1)}</b></span><span>{participant.fixesReviewed} fixes reviewed</span><span>90-day rank {participant.rank90d ? `#${participant.rank90d}` : '—'}</span></div>
                <details className="mw-validator-history"><summary>Prior vote history and rationale</summary><p>Prior votes: {participant.priorVotes.accept} accept · {participant.priorVotes.modify} modify · {participant.priorVotes.reject} reject.</p>{participant.rationale && <p><b>Rationale on this fix:</b> {participant.rationale}</p>}<small>OASIS reputation is a context signal, not a probability that this vote is correct.</small></details>
              </div>
            </article>)}</div>
            {validationParticipants.length > 4 && <button className="mw-show-participants" type="button" aria-expanded={showAllParticipants} onClick={() => setShowAllParticipants(value => !value)}>{showAllParticipants ? 'Show fewer validators' : `Show all ${validationParticipants.length} validators`}</button>}
            <p className="mw-validation-demo-note">Illustrative validator accounts and history. A live version would show the revision-specific OASIS profile evidence available to authorized maintainers.</p>
          </section>
          {!selectedFix.trust && <div className="mw-trust-explanation"><strong>Trust and repository review are separate.</strong><span>This fix has not reached the standard OASIS trust threshold. A maintainer can still make a repo-specific decision when technical submission checks pass. Your decision does not change the community trust status.</span></div>}
          {selectedFix.status === 'Ready for review' || selectedFix.status === 'Changes requested' ? <>
            {selectedFix.status === 'Changes requested' && changeNotes[selectedFix.id] && <div className="mw-change-history"><strong>Changes requested · {selectedFix.revision}</strong><p>{changeNotes[selectedFix.id]}</p></div>}
            <div className="mw-readiness"><span className="mw-step is-done">1 Review</span><span className="mw-step">2 Approve revision</span><span className="mw-step">3 Prepare PR</span><span className="mw-step">4 GitHub</span></div>
            <div className="mw-detail-actions"><button className="mw-primary" onClick={() => updateSelected({ status: 'Selected' }, `Approved ${selectedFix.revision} (${selectedFix.sha}) for upstream. This approval applies to that exact revision only; no PR was created.`)}><Check size={15} /> Approve {selectedFix.revision} for upstream</button><button className="mw-secondary" onClick={() => { setDecisionTarget({ fixId: selectedFix.id, revision: selectedFix.revision, sha: selectedFix.sha }); setChangeRequestOpen(true) }}>Request changes</button><button className="mw-danger" onClick={() => { setDecisionTarget({ fixId: selectedFix.id, revision: selectedFix.revision, sha: selectedFix.sha }); setDeclineOpen(true) }}>Decline…</button></div>
          </> : selectedFix.status === 'Selected' ? <><div className="mw-approved-note"><Check size={15} /><span>{selectedFix.revision} ({selectedFix.sha}) approved. Approval is revision-specific and does not create a PR.</span></div><button className="mw-primary" onClick={() => setCreatePrOpen(true)}>Prepare upstream PR <ArrowRight size={15} /></button></> : selectedFix.status === 'Declined' ? <div className="mw-decline-history"><div><strong>Declined by Demo Maintainer</strong><span>Today · {selectedFix.revision} · reason recorded</span></div><p>{declineNotes[selectedFix.id] ?? 'The maintainer recorded why this fix does not fit the repository.'}</p></div> : <div className="mw-upstream-state"><span>{selectedFix.status === 'Submitted' ? 'Upstream pull request · demo data' : 'Merged upstream · demo data'}</span><strong>{selectedFix.status === 'Submitted' ? 'Open · checks running · demo #415' : 'Merged · demo #398'}</strong><p>Prototype example only. No GitHub pull request is linked.</p></div>}
          <details className="mw-provenance"><summary>Tooling and revision details</summary><p>Finding: Lantern 4.2 · Fix generated by: Mender 2.3 · Revision: {selectedFix.revision} · {selectedFix.sha}</p></details>
          {declineOpen && decisionTarget?.fixId === selectedFix.id && <form className="mw-decline-form" onSubmit={submitDecline}><div><strong>Why are you declining {decisionTarget.fixId} · {decisionTarget.revision}?</strong><button type="button" aria-label="Close decline form" onClick={() => { setDeclineOpen(false); setDecisionTarget(null) }}><X size={15} /></button></div><p>Your reason is recorded with this revision and shown to the fix author and validators.</p><textarea required minLength={10} value={declineReason} onChange={event => setDeclineReason(event.target.value)} placeholder="Explain what does not fit this repository (at least 10 characters)." /><button className="mw-danger-submit" type="submit" disabled={declineReason.trim().length < 10}>Record decline</button></form>}
          {changeRequestOpen && decisionTarget?.fixId === selectedFix.id && <form className="mw-change-form" onSubmit={submitChangeRequest}><div><strong>What needs to change on {decisionTarget.fixId} · {decisionTarget.revision}?</strong><button type="button" aria-label="Close request changes form" onClick={() => { setChangeRequestOpen(false); setDecisionTarget(null) }}><X size={15} /></button></div><p>Your reason is recorded with this revision and shown to the fix author and validators.</p><textarea required minLength={10} value={changeReason} onChange={event => setChangeReason(event.target.value)} placeholder="Describe the change needed (at least 10 characters)." /><button className="mw-primary" type="submit" disabled={changeReason.trim().length < 10}>Record change request</button></form>}
          {createPrOpen && <div className="mw-pr-confirm"><div><strong>Review upstream PR details</strong><button aria-label="Close PR preview" onClick={() => setCreatePrOpen(false)}><X size={15} /></button></div><p><b>Source:</b> OASIS fixes fork · {selectedFix.revision} ({selectedFix.sha})</p><p><b>Destination:</b> {selectedFix.repo} → {selectedFix.repo.includes('jsonpath') ? 'main' : 'develop'}</p><p>The PR opens in GitHub for the repository’s normal review. OASIS will not merge it.</p><button className="mw-primary" onClick={createUpstreamPr}>Create upstream PR <ArrowRight size={15} /></button></div>}
        </article>}
      </div>
    </section>}
    <p className="mw-footnote"><CircleAlert size={13} /> Prototype only: buttons change the preview state. The source product must verify GitHub authority and persist decisions on the server.</p>
  </main>
}
