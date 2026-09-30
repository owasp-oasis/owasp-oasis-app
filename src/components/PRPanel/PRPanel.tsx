/**
 * PRPanel — slide-out side panel for reviewing a PR.
 *
 * Tabs: Summary | Details | Diff | Comments | Workflow
 * Vote bar: Accept / Modify / Reject (open PRs only)
 * VoteForm drawer slides up from bottom when a decision is selected.
 */
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import VoteForm, { type Decision } from '../VoteForm'
import { Maximize2, Minimize2, X, ExternalLink, LockKeyhole } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { FixChips, SeverityChip } from '../../pages/workspace/FixChips'
import { getToolUrl } from '../../pages/workspace/toolLinks'
import { useSearchParams } from 'react-router-dom'
import BodyTab from './BodyTab'
import ChangesTab from './ChangesTab'
import CommentsTab from './CommentsTab'
import SummaryTab from './SummaryTab'
import WorkflowTab from './WorkflowTab'
import './PRPanel.css'
import { trackReviewEngagement } from '../../analytics'

/* ── Shared PR type (from workspace API) ────────────────────── */
export interface PanelPR {
  id: number
  repo_name: string
  number: number
  title: string
  state: string
  html_url: string
  consensus_accept: number
  consensus_modify: number
  consensus_reject: number
  consensus_duplicate?: number
  participants?: number
}

/* ── Details shape returned by /api/pr-panel/:id/details ─────── */
interface PRDetails {
  title: string
  number: number
  state: string
  html_url: string
  body: string
  user: { login: string; avatar_url: string }
  created_at: string
  updated_at: string
  merged_at: string | null
  additions: number
  deletions: number
  changed_files: number
  head_sha: string
  cwe_id: string | null
  cwe_desc: string | null
  cvss_severity: string | null
  cve_id: string | null
  capec_id: string | null
  cvss_score: string | null
  tldr: string | null
  detection_tool: string | null
}

type Tab = 'body' | 'changes' | 'comments' | 'summary' | 'workflow'

interface Props {
  pr: PanelPR | null
  presentation?: 'drawer' | 'inline'
  myVotes: Map<number, Decision>
  onClose: () => void
  onVoteSuccess: (pr: PanelPR, decision: Decision) => void
}

const DONOR_LOGOS: Record<string, { src: string; alt: string }> = {
  appsecai: { src: 'https://www.appsecai.io/hubfs/Logo.%20Blue.%20Horizontal.svg', alt: 'AppSecAI' },
  'dryrun security': { src: 'https://cdn.prod.website-files.com/645932d9286e9c20dd8e0fca/688b80486034525524cedf86_DRS-Logo-icon-green-white-dark%20background.svg', alt: 'DryRun Security' },
}

const FIX_AUTOMATION_BY_AUTHOR: Record<string, string> = {
  'appsecai-app[bot]': 'AppSecAI',
  'appsecai-bot': 'AppSecAI',
  'dryrun-bot': 'DryRun Security',
  'dryrun-security': 'DryRun Security',
  'dryrun-security[bot]': 'DryRun Security',
}

function fixAutomation(details: PRDetails): string | null {
  const author = details.user?.login?.trim().toLowerCase()
  return (author && FIX_AUTOMATION_BY_AUTHOR[author]) || details.detection_tool
}

function DonorLogo({ tool }: { tool: string }) {
  const logo = DONOR_LOGOS[tool.trim().toLowerCase()]
  const content = <>{logo && <img src={logo.src} alt={logo.alt} />}<span>{tool}</span></>
  const url = getToolUrl(tool)
  return url
    ? <a className="prp-donor" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${tool} website`}>{content}</a>
    : <span className="prp-donor">{content}</span>
}

/* ── Sign-in modal (shown when unauthenticated user clicks a row) */
interface SignInModalProps {
  onClose: () => void
}
export function SignInModal({ onClose }: SignInModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="prp-signin-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="prp-signin-card" role="dialog" aria-modal="true" aria-label="Sign in required">
        <div className="prp-signin-icon" aria-hidden="true"><LockKeyhole size={24} /></div>
        <h2 className="prp-signin-title">Sign in to review PRs</h2>
        <p className="prp-signin-body">
          You need to sign in with GitHub to view PR details, read comments,
          and cast your OASIS vote.
        </p>
        <div className="prp-signin-actions">
          <a href="/api/auth/login" className="prp-signin-btn prp-signin-btn--primary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
            </svg>
            Sign in with GitHub
          </a>
          <button className="prp-signin-btn prp-signin-btn--secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Main panel ──────────────────────────────────────────────── */
export default function PRPanel({ pr, myVotes, onClose, onVoteSuccess, presentation = 'drawer' }: Props) {
  const { user } = useAuth()

  const [params, setParams] = useSearchParams()
  const activeTab = (['summary','body','changes','comments','workflow'].includes(params.get('tab') ?? '') ? params.get('tab') : 'summary') as Tab
  const setActiveTab = (tab: Tab) => { const next = new URLSearchParams(params); next.set('tab', tab); setParams(next, { replace: true }) }
  const { preferences } = useWorkspace()
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const panelRef = useRef<HTMLElement>(null)
  const modal = expanded || presentation === 'drawer'
  const [voteDecision, setVoteDecision] = useState<Decision | null>(null)
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [refetchComments, setRefetchComments] = useState(0)
  const [showSignIn, setShowSignIn]     = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  // Details fetch (shared by PR tab, Body tab, Summary tab)
  const [details, setDetails]     = useState<PRDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError]   = useState<string | null>(null)
  const [detailsRetry, setDetailsRetry] = useState(0)

  const bodyRef = useRef<HTMLDivElement>(null)
  const prevPrId = useRef<number | null>(null)

  // Reset panel state when PR changes
  useEffect(() => {
    if (!pr) return
    if (pr.id !== prevPrId.current) {
      prevPrId.current = pr.id
      setVoteDecision(null)
      setCommentCount(null)
      setDetails(null)
      setDetailsError(null)
      setDetailsRetry(0)
      setNudgeDismissed(false)
      if (bodyRef.current) bodyRef.current.scrollTop = 0
    }
  }, [pr])

  // Fetch details when PR changes
  useEffect(() => {
    if (!pr) return
    const controller = new AbortController()
    setDetailsLoading(true); setDetailsError(null); setDetails(null)
    fetch(`/api/pr-panel/${pr.id}/details`, { signal: controller.signal })
      .then(async r => { const data = await r.json(); if (!r.ok || !data.ok) throw new Error(data.error ?? 'Could not load candidate fix details'); return data })
      .then(setDetails)
      .catch(err => { if (!controller.signal.aborted) setDetailsError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setDetailsLoading(false) })
    return () => controller.abort()
  }, [pr?.id, detailsRetry])

  // Record aggregate active-review time without sending a login or stable user
  // identifier. Hidden or idle tabs do not accrue active seconds.
  useEffect(() => {
    if (!pr || !user) return
    const prId = pr.id
    let lastActivity = Date.now()
    let lastTick = Date.now()
    const noteActivity = () => { lastActivity = Date.now() }
    const activityEvents: Array<keyof DocumentEventMap> = [
      'keydown', 'pointerdown', 'touchstart', 'wheel',
    ]
    activityEvents.forEach(type => document.addEventListener(type, noteActivity, { passive: true }))
    trackReviewEngagement(prId, 'review_opened')
    const timer = window.setInterval(() => {
      const now = Date.now()
      const intervalSeconds = Math.min(30, Math.max(1, Math.round((now - lastTick) / 1000)))
      if (document.visibilityState === 'visible' && now - lastActivity <= 45_000) {
        trackReviewEngagement(prId, 'review_heartbeat', intervalSeconds)
      }
      lastTick = now
    }, 30_000)
    return () => {
      window.clearInterval(timer)
      activityEvents.forEach(type => document.removeEventListener(type, noteActivity))
      trackReviewEngagement(prId, 'review_closed')
    }
  }, [pr, user])

  useEffect(() => {
    if (!pr || !modal) return
    const previous = document.activeElement as HTMLElement | null
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length-1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last?.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', trap)
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown',trap); previous?.focus() }
  }, [!!pr, modal])
  useEffect(() => {
    if (!pr) return
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || submitting) return
      const field = (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')
      if (e.key === 'Escape') {
        e.preventDefault()
        if (field) { (e.target as HTMLElement).blur(); return }
        if (voteDecision) setVoteDecision(null)
        else if (expanded) setExpanded(false)
        else onClose()
        return
      }
      if (!preferences.keyboardShortcuts || field || e.ctrlKey || e.metaKey || e.altKey || !user || pr.state !== 'open' || myVotes.has(pr.id)) return
      if ((e.target as HTMLElement)?.closest('button,a,[role=tab]')) return
      const decisions: Record<string,Decision> = { a:'accept',m:'modify',r:'reject',d:'duplicate' }
      const decision = decisions[e.key.toLowerCase()]
      if (decision) { e.preventDefault(); setVoteDecision(old => old === decision ? null : decision) }
    }
    document.addEventListener('keydown',key)
    return () => document.removeEventListener('keydown',key)
  }, [pr, submitting, voteDecision, expanded, preferences.keyboardShortcuts, user, myVotes, onClose])

  if (!pr) return null

  const activePR = pr  // narrowed to PanelPR (non-null)
  const isOpen   = activePR.state === 'open'
  const myVote   = myVotes.get(activePR.id) ?? null

  function handleVoteSuccess(decision: Decision) {
    setVoteDecision(null)
    setRefetchComments(n => n + 1)
    onVoteSuccess(activePR, decision)
  }

  function handleVoteButtonClick(d: Decision) {
    if (myVote) return // already voted — show nothing
    setVoteDecision(prev => prev === d ? null : d) // toggle
  }

  const DECISION_LABELS: Record<Decision, string> = {
    accept: 'Accept',
    modify: 'Modify',
    reject: 'Reject',
    duplicate: 'Duplicate',
  }
  const DECISION_GLYPHS: Record<Decision, string> = { accept: '✓', modify: '~', reject: '✕', duplicate: '⧉' }


  const tabs: { id: Tab; label: string }[] = [
    { id: 'summary',  label: 'Summary' },
    { id: 'body',     label: 'Details' },
    { id: 'changes',  label: 'Diff' },
    { id: 'comments', label: commentCount !== null ? `Comments (${commentCount})` : 'Comments' },
    { id: 'workflow', label: 'Workflow' },
  ]

  // SummaryTab needs details augmented with consensus counts from the workspace PR
  const summaryDetails = details ? {
    ...details,
    consensus_accept: activePR.consensus_accept,
    consensus_modify: activePR.consensus_modify,
    consensus_reject: activePR.consensus_reject,
    consensus_duplicate: activePR.consensus_duplicate ?? 0,
    participants: activePR.participants ?? 0,
  } : null
  const automation = details ? fixAutomation(details) : null

  return (
    <>
      {showSignIn && <SignInModal onClose={() => setShowSignIn(false)} />}
      <>{modal && <div className="prp-backdrop" onClick={() => { if (!submitting) expanded ? setExpanded(false) : onClose() }} aria-hidden="true" />}</>

      <aside ref={panelRef} tabIndex={-1} className={"prp-panel prp-panel--open prp-v3 " + (expanded ? "prp-panel--expanded" : presentation === "inline" ? "prp-panel--inline" : "")}
             role={modal ? "dialog" : "region"} aria-modal={modal || undefined}
             aria-label={`PR #${activePR.number} details`}>

        {/* Header */}
        <div className="prp-header">
          <div className="prp-header-top">
            <span className="prp-identity">{activePR.repo_name} #{activePR.number}</span>
            <div className="ws-chips"><FixChips pr={activePR}/></div>
            <span className="prp-header-spacer" />
            <a href={activePR.html_url} target="_blank" rel="noopener noreferrer" className="prp-gh-link" title="Open on GitHub"><ExternalLink size={14}/> Open on GitHub</a>
            <button className="prp-close" disabled={submitting} onClick={onClose} aria-label="Close panel"><X size={18}/></button>
          </div>
          <h2 className="prp-fix-title">{activePR.title}</h2>
          <div className="prp-meta-grid" aria-label="Candidate fix metadata">
            <div><span>Severity</span><strong className="prp-meta-severity"><SeverityChip title={activePR.title}/>{details?.cvss_score ? ` · ${details.cvss_score}` : ''}</strong></div>
            <div><span>Weakness</span><strong>{details?.cwe_id ? `${details.cwe_id}${details.cwe_desc ? ` · ${details.cwe_desc}` : ''}` : '—'}</strong></div>
            <div><span>CVE</span><strong className="prp-meta-mono">{details?.cve_id ?? '—'}</strong></div>
            <div><span>Fix automation</span><strong>{automation ? <DonorLogo tool={automation} /> : '—'}</strong></div>
          </div>
        </div>

        {/* Auth nudge banner (unauthenticated users only, dismissible) */}
        {!user && !nudgeDismissed && (
          <div className="prp-auth-nudge">
            <span>Sign in to cast your vote</span>
            <a href="/api/auth/login" className="prp-nudge-signin">Sign in with GitHub</a>
            <button className="prp-nudge-dismiss" onClick={() => setNudgeDismissed(true)}>
              Continue read-only ×
            </button>
          </div>
        )}

        {/* Tab bar */}
        <div className="prp-tab-bar" role="tablist" aria-label="Candidate fix details">
          {tabs.map(t => (
            <button
              key={t.id}
              id={`prp-tab-${t.id}`}
              role="tab"
              aria-selected={activeTab === t.id}
              aria-controls="prp-tabpanel"
              className={`prp-tab${activeTab === t.id ? ' prp-tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
          <button className="prp-expand" disabled={submitting} onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Collapse detail" : "Expand detail"}>{expanded ? <Minimize2 size={16}/> : <Maximize2 size={16}/>}<span>{expanded ? "Collapse" : "Expand"}</span></button>
        </div>

        {/* Scrollable body */}
        <div id="prp-tabpanel" className="prp-body" ref={bodyRef} role="tabpanel" aria-labelledby={`prp-tab-${activeTab}`}>
          {activeTab === 'body' && (
            <BodyTab
              body={details?.body ?? null}
              loading={detailsLoading}
              error={detailsError}
              onRetry={() => setDetailsRetry(value => value + 1)}
            />
          )}
          {activeTab === 'changes' && (
            <ChangesTab prId={activePR.id} diffView={preferences.diffView} />
          )}
          {activeTab === 'comments' && (
            <CommentsTab
              prId={activePR.id}
              refetchTrigger={refetchComments}
              onCountLoaded={setCommentCount}
              onSignInRequired={() => setShowSignIn(true)}
            />
          )}
          {activeTab === 'summary' && (
            <SummaryTab
              details={summaryDetails}
              loading={detailsLoading}
              error={detailsError}
              onRetry={() => setDetailsRetry(value => value + 1)}
            />
          )}
          {activeTab === 'workflow' && (
            <WorkflowTab prId={activePR.id} isAdmin={user?.role === 'admin'} />
          )}
        </div>

        {/* Review footer: one decision bar, followed by its form. Keeping this
            below the scrollable detail content matches the reference workflow
            and prevents the form from obscuring a diff or comment thread. */}
        <div className="prp-vote-footer">
          {isOpen && user && !myVote && (
            <div className="prp-vote-bar" aria-label="Your validation">
              <span className="prp-vote-label">Your validation</span>
              {(['accept', 'modify', 'reject', 'duplicate'] as Decision[]).map(d => {
                const isActive = voteDecision === d
                const classes = ['prp-vote-btn', `prp-vote-btn--${d}`, isActive ? 'prp-vote-btn--active' : ''].filter(Boolean).join(' ')
                return <button key={d} className={classes} onClick={() => handleVoteButtonClick(d)} disabled={submitting} aria-pressed={isActive} aria-keyshortcuts={preferences.keyboardShortcuts ? d[0].toUpperCase() : undefined} title={`Vote ${d}`}><span className="prp-vote-glyph" aria-hidden="true">{DECISION_GLYPHS[d]}</span><span><u>{DECISION_LABELS[d][0]}</u>{DECISION_LABELS[d].slice(1)}</span></button>
              })}
            </div>
          )}
          {isOpen && user && myVote && (
            <div className="prp-vote-complete" role="status">
              <span className="prp-vote-complete-icon" aria-hidden="true">✓</span>
              <span>You voted <strong>{DECISION_LABELS[myVote]}</strong>. Your OASIS comment is on the GitHub PR.</span>
            </div>
          )}
          {!user && isOpen && <div className="prp-vote-complete"><span>Sign in with GitHub to cast your validation.</span><a href="/api/auth/login" className="prp-nudge-signin">Sign in with GitHub</a></div>}
          {!isOpen && <div className="prp-vote-complete"><span>This candidate fix is closed. Voting is disabled.</span></div>}
          {voteDecision && !myVote && isOpen && (
            <div className="prp-vote-form">
              <VoteForm
                key={activePR.id}
                onSubmittingChange={setSubmitting}
                pr={activePR}
                initialDecision={voteDecision}
                onClose={() => setVoteDecision(null)}
                onSuccess={handleVoteSuccess}
              />
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
