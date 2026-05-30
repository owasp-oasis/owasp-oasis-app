/**
 * PRPanel — slide-out side panel for reviewing a PR.
 *
 * Tabs: PR info | Body | Changes | Comments | Summary
 * Vote bar: Accept / Modify / Reject (open PRs only)
 * VoteForm drawer slides up from bottom when a decision is selected.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import VoteForm, { type Decision } from '../VoteForm'
import PRTab from './PRTab'
import BodyTab from './BodyTab'
import ChangesTab from './ChangesTab'
import CommentsTab from './CommentsTab'
import SummaryTab from './SummaryTab'
import './PRPanel.css'

/* ── Shared PR type (from leaderboard API) ───────────────────── */
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

type Tab = 'pr' | 'body' | 'changes' | 'comments' | 'summary'

interface Props {
  pr: PanelPR | null
  myVotes: Map<number, Decision>
  onClose: () => void
  onVoteSuccess: (pr: PanelPR, decision: Decision) => void
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
        <div className="prp-signin-icon">🔒</div>
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
export default function PRPanel({ pr, myVotes, onClose, onVoteSuccess }: Props) {
  const { user } = useAuth()

  const [activeTab, setActiveTab]       = useState<Tab>('pr')
  const [voteDecision, setVoteDecision] = useState<Decision | null>(null)
  const [commentCount, setCommentCount] = useState<number | null>(null)
  const [refetchComments, setRefetchComments] = useState(0)

  // Details fetch (shared by PR tab, Body tab, Summary tab)
  const [details, setDetails]     = useState<PRDetails | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [detailsError, setDetailsError]   = useState<string | null>(null)

  const bodyRef = useRef<HTMLDivElement>(null)
  const prevPrId = useRef<number | null>(null)

  // Reset panel state when PR changes
  useEffect(() => {
    if (!pr) return
    if (pr.id !== prevPrId.current) {
      prevPrId.current = pr.id
      setActiveTab('pr')
      setVoteDecision(null)
      setCommentCount(null)
      setDetails(null)
      setDetailsError(null)
      if (bodyRef.current) bodyRef.current.scrollTop = 0
    }
  }, [pr])

  // Fetch details when PR changes
  const fetchDetails = useCallback(() => {
    if (!pr) return
    setDetailsLoading(true)
    setDetailsError(null)
    fetch(`/api/pr-panel/${pr.id}/details`)
      .then(r => r.json() as Promise<{ ok: boolean } & Partial<PRDetails> & { error?: string }>)
      .then(d => {
        if (!d.ok) { setDetailsError(d.error ?? 'Failed to load PR details'); return }
        setDetails(d as unknown as PRDetails)
      })
      .catch(err => setDetailsError((err as Error).message))
      .finally(() => setDetailsLoading(false))
  }, [pr])

  useEffect(() => { fetchDetails() }, [fetchDetails])

  // Close on Escape
  useEffect(() => {
    if (!pr) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pr, onClose])

  if (!pr) return null

  const activePR  = pr  // narrowed to PanelPR (non-null)
  const isOpen    = activePR.state === 'open'
  const myVote    = myVotes.get(activePR.id) ?? null
  const panelOpen = true

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
  }

  const stateClass = activePR.state === 'open' ? 'state-badge state-open' : 'state-badge state-closed'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'pr',       label: 'PR' },
    { id: 'body',     label: 'Body' },
    { id: 'changes',  label: 'Changes' },
    { id: 'comments', label: commentCount !== null ? `Comments (${commentCount})` : 'Comments' },
    { id: 'summary',  label: 'Summary' },
  ]

  // SummaryTab needs details augmented with consensus counts from the leaderboard PR
  const summaryDetails = details ? {
    ...details,
    consensus_accept: activePR.consensus_accept,
    consensus_modify: activePR.consensus_modify,
    consensus_reject: activePR.consensus_reject,
  } : null

  return (
    <>
      <div className="prp-backdrop" onClick={onClose} aria-hidden="true" />

      <aside className={`prp-panel${panelOpen ? ' prp-panel--open' : ''}`}
             role="complementary"
             aria-label={`PR #${activePR.number} details`}>

        {/* Header */}
        <div className="prp-header">
          <button className="prp-close" onClick={onClose} aria-label="Close panel">✕</button>
          <span className="prp-identity">{activePR.repo_name} #{activePR.number}</span>
          <span className={stateClass}>{activePR.state}</span>
          <div className="prp-header-spacer" />
          <a
            href={activePR.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="prp-gh-link"
            title="Open on GitHub"
          >
            ↗ GitHub
          </a>
        </div>

        {/* Vote bar (open PRs only) */}
        {isOpen && (
          <div className="prp-vote-bar">
            <span className="prp-vote-label">Your vote:</span>
            {(['accept', 'modify', 'reject'] as Decision[]).map(d => {
              const isVoted  = myVote === d
              const isActive = voteDecision === d && !myVote
              const classes  = [
                'prp-vote-btn',
                `prp-vote-btn--${d}`,
                isVoted  ? 'prp-vote-btn--voted'  : '',
                isActive ? 'prp-vote-btn--active' : '',
              ].filter(Boolean).join(' ')

              return (
                <button
                  key={d}
                  className={classes}
                  onClick={() => handleVoteButtonClick(d)}
                  disabled={!!myVote}
                  title={myVote ? `You voted ${myVote}` : `Vote ${d}`}
                >
                  {isVoted ? `✓ ${DECISION_LABELS[d]}` : DECISION_LABELS[d]}
                </button>
              )
            })}
            {!user && (
              <a href="/api/auth/login" className="prp-gh-link" style={{ marginLeft: 'auto' }}>
                Sign in to vote
              </a>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div className="prp-tab-bar" role="tablist">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`prp-tab${activeTab === t.id ? ' prp-tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="prp-body" ref={bodyRef} role="tabpanel">
          {activeTab === 'pr' && (
            <PRTab
              details={details}
              loading={detailsLoading}
              error={detailsError}
            />
          )}
          {activeTab === 'body' && (
            <BodyTab
              body={details?.body ?? null}
              loading={detailsLoading}
              error={detailsError}
            />
          )}
          {activeTab === 'changes' && (
            <ChangesTab prId={activePR.id} />
          )}
          {activeTab === 'comments' && (
            <CommentsTab
              prId={activePR.id}
              refetchTrigger={refetchComments}
              onCountLoaded={setCommentCount}
            />
          )}
          {activeTab === 'summary' && (
            <SummaryTab
              details={summaryDetails}
              loading={detailsLoading}
              error={detailsError}
            />
          )}
        </div>

        {/* Vote form drawer */}
        {voteDecision && !myVote && isOpen && (
          <div className="prp-vote-form">
            <div className="prp-vote-form-header">
              <span className="prp-vote-form-title">
                Cast your vote — {DECISION_LABELS[voteDecision]}
              </span>
              <button
                className="prp-vote-form-close"
                onClick={() => setVoteDecision(null)}
                aria-label="Close vote form"
              >
                ✕
              </button>
            </div>
            <VoteForm
              pr={activePR}
              initialDecision={voteDecision}
              onClose={() => setVoteDecision(null)}
              onSuccess={handleVoteSuccess}
            />
          </div>
        )}
      </aside>
    </>
  )
}
