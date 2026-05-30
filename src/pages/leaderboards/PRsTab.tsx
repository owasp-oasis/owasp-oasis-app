import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import SortableTable from '../../components/SortableTable'
import type { Column } from '../../components/SortableTable'
import ColHeader from '../../components/ColHeader'
import VoteModal from '../../components/VoteModal'
import { useAuth } from '../../context/AuthContext'

interface PR {
  id: number
  repo_name: string
  number: number
  title: string
  state: string
  author: string | null
  html_url: string
  comment_count: number
  oasis_comment_count: number
  non_oasis_comment_count: number
  participants: number
  consensus_accept: number
  consensus_modify: number
  consensus_reject: number
  merged_upstream: number
  updated_at: string
}

const TRUST_MIN_CONTRIBUTORS = 10
const TRUST_MIN_ACCEPT_RATE  = 0.75

type OASISStatus = 'Needs Review' | 'Trusted' | 'Rejected' | 'Accepted'

function getOASISStatus(pr: PR): OASISStatus {
  // Accepted: merged into upstream AND the fork PR is closed
  if (pr.merged_upstream && pr.state === 'closed') return 'Accepted'
  // Rejected: fork PR is closed without being merged upstream
  if (pr.state === 'closed' && !pr.merged_upstream) return 'Rejected'
  // Open PR checks — evaluate trust criteria
  const totalVotes = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject
  const acceptRate = totalVotes > 0 ? pr.consensus_accept / totalVotes : 0
  if (pr.participants >= TRUST_MIN_CONTRIBUTORS && acceptRate >= TRUST_MIN_ACCEPT_RATE) return 'Trusted'
  return 'Needs Review'
}

function StatusBadge({ status }: { status: OASISStatus }) {
  const cls: Record<OASISStatus, string> = {
    'Needs Review': 'state-badge state-needs-review',
    'Trusted':      'state-badge state-trusted',
    'Rejected':     'state-badge state-closed',
    'Accepted':     'state-badge state-merged',
  }
  return <span className={cls[status]}>{status}</span>
}

const STATUS_DEFINITIONS: { status: OASISStatus; cls: string; description: string; todo?: boolean }[] = [
  {
    status: 'Needs Review',
    cls: 'state-needs-review',
    description: 'Open PR in the OASIS fork that has not yet reached the minimum criteria for an OASIS Stamp of Trust.',
  },
  {
    status: 'Trusted',
    cls: 'state-trusted',
    description: `Open PR that meets the trust threshold (${TRUST_MIN_CONTRIBUTORS}+ participants, ${Math.round(TRUST_MIN_ACCEPT_RATE * 100)}%+ acceptance votes). Ready to be considered for upstream submission.`,
  },
  {
    status: 'Rejected',
    cls: 'state-closed',
    description: 'The OASIS fork PR has been closed without being merged upstream. The fix was not adopted.',
  },
  {
    status: 'Accepted',
    cls: 'state-merged',
    description: 'The fix was merged into the upstream repository and the fork PR is closed. Automatic detection of upstream merges is a TODO — this status is currently set manually.',
    todo: true,
  },
]

function StatusKey() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className="status-key-wrap" ref={ref}>
      <button
        className="status-key-btn"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        title="Show status key"
      >
        Status <span className="status-key-icon">ⓘ</span>
      </button>
      {open && (
        <div className="status-key-panel" role="dialog" aria-label="Status definitions">
          <h4>PR Status Definitions</h4>
          <ul>
            {STATUS_DEFINITIONS.map(({ status, cls, description, todo }) => (
              <li key={status}>
                <div className="status-key-badge-row">
                  <span className={`state-badge ${cls}`}>{status}</span>
                  {todo && <span className="todo-badge" style={{ fontSize: '0.65rem' }}>TODO</span>}
                </div>
                <p>{description}</p>
              </li>
            ))}
          </ul>
          <p className="status-key-stub-note">
            Trust criteria are a stub — thresholds will be refined by the community.
          </p>
        </div>
      )}
    </div>
  )
}

type FilterMode = 'all' | OASISStatus
const FILTER_MODES: { id: FilterMode; label: string }[] = [
  { id: 'all',          label: 'All PRs' },
  { id: 'Needs Review', label: 'Needs Review' },
  { id: 'Trusted',      label: 'Trusted' },
  { id: 'Rejected',     label: 'Rejected' },
  { id: 'Accepted',     label: 'Accepted' },
]

type AugmentedPR = PR & { oasis_status: OASISStatus }

// Map of pr_id → decision for the current user's votes
type VoteMap = Map<number, 'accept' | 'modify' | 'reject'>

interface Props { data: PR[]; loading: boolean }

export default function PRsTab({ data, loading }: Props) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [showStamp, setShowStamp] = useState(false)
  const { user } = useAuth()

  // My votes state
  const [myVotes, setMyVotes] = useState<VoteMap>(new Map())
  const [votesLoaded, setVotesLoaded] = useState(false)

  // Active modal state
  const [modalPR, setModalPR] = useState<PR | null>(null)

  // Local PR overrides for optimistic updates (consensus counts)
  const [localOverrides, setLocalOverrides] = useState<Map<number, Partial<PR>>>(new Map())

  const fetchMyVotes = useCallback(async () => {
    if (!user) { setMyVotes(new Map()); setVotesLoaded(true); return }
    try {
      const res = await fetch('/api/votes/mine', { credentials: 'include' })
      if (!res.ok) { setVotesLoaded(true); return }
      const d = await res.json() as { ok: boolean; votes: { pr_id: number; decision: string }[] }
      const map: VoteMap = new Map()
      for (const v of d.votes ?? []) {
        map.set(v.pr_id, v.decision as 'accept' | 'modify' | 'reject')
      }
      setMyVotes(map)
    } catch { /* non-fatal */ }
    setVotesLoaded(true)
  }, [user])

  useEffect(() => { fetchMyVotes() }, [fetchMyVotes])

  function handleVoteSuccess(pr: PR, decision: 'accept' | 'modify' | 'reject') {
    // Optimistic: record vote + increment consensus count locally
    setMyVotes(prev => new Map(prev).set(pr.id, decision))
    setLocalOverrides(prev => {
      const next = new Map(prev)
      const existing = next.get(pr.id) ?? {}
      next.set(pr.id, {
        ...existing,
        consensus_accept: (pr.consensus_accept + (decision === 'accept' ? 1 : 0)),
        consensus_modify: (pr.consensus_modify + (decision === 'modify' ? 1 : 0)),
        consensus_reject: (pr.consensus_reject + (decision === 'reject' ? 1 : 0)),
        oasis_comment_count: pr.oasis_comment_count + 1,
        participants: pr.participants + 1,
      })
      return next
    })
    setModalPR(null)
  }

  // Decide vote column content for a given PR
  function voteCell(pr: AugmentedPR) {
    if (pr.state !== 'open') return null
    const voted = myVotes.get(pr.id)
    if (voted) {
      const cls = { accept: 'state-badge state-trusted', modify: 'state-badge state-needs-review', reject: 'state-badge state-closed' }[voted]
      const label = { accept: 'Accepted', modify: 'Modified', reject: 'Rejected' }[voted]
      return <span className={cls}>{label}</span>
    }
    if (!user) {
      return (
        <a href="/api/auth/login" className="vote-signin-link">
          Sign in to vote
        </a>
      )
    }
    return (
      <button
        className="vote-btn"
        onClick={() => setModalPR(pr)}
        title="Cast your OASIS vote on this PR"
      >
        Vote
      </button>
    )
  }

  const columns: Column<AugmentedPR>[] = [
    {
      key: 'repo_name',
      label: 'Repository',
      render: (v) => (
        <a href={`https://github.com/owasp-oasis/${v}`} target="_blank" rel="noopener noreferrer">
          {String(v)}
        </a>
      ),
    },
    {
      key: 'title',
      label: 'Pull Request',
      render: (v, row) => (
        <a href={String(row.html_url)} target="_blank" rel="noopener noreferrer" title={String(v)}>
          #{row.number} {String(v).length > 55 ? String(v).slice(0, 55) + '…' : String(v)}
        </a>
      ),
    },
    {
      key: 'oasis_status',
      label: <StatusKey />,
      sortable: true,
      searchable: false,
      render: (v) => <StatusBadge status={v as OASISStatus} />,
      align: 'center',
    },
    {
      key: 'oasis_comment_count',
      label: <ColHeader icon="🗳" label="OASIS Votes" />,
      sortable: true,
      searchable: false,
      align: 'right',
    },
    {
      key: 'non_oasis_comment_count',
      label: <ColHeader icon="💬" label="Non-OASIS" />,
      sortable: true,
      searchable: false,
      align: 'right',
      render: (v) => (
        <span style={{ color: Number(v) > 0 ? 'var(--muted)' : 'inherit' }}>
          {String(v)}
        </span>
      ),
    },
    {
      key: 'consensus_accept',
      label: <ColHeader icon="✅" label="Accept votes" />,
      sortable: true,
      searchable: false,
      align: 'right',
      render: (v) => <span className="consensus-accept">{String(v)}</span>,
    },
    {
      key: 'consensus_modify',
      label: <ColHeader icon="⚠️" label="Modify votes" />,
      sortable: true,
      searchable: false,
      align: 'right',
      render: (v) => <span className="consensus-modify">{String(v)}</span>,
    },
    {
      key: 'consensus_reject',
      label: <ColHeader icon="👎" label="Reject votes" />,
      sortable: true,
      searchable: false,
      align: 'right',
      render: (v) => <span className="consensus-reject">{String(v)}</span>,
    },
    {
      key: 'participants',
      label: <ColHeader icon="👥" label="Participants" />,
      sortable: true,
      searchable: false,
      align: 'right',
    },
    {
      key: 'updated_at',
      label: <ColHeader icon="📅" label="Last updated" />,
      sortable: true,
      searchable: false,
      render: (v) => v ? new Date(String(v)).toLocaleDateString() : '—',
      align: 'right',
    },
    {
      key: 'id' as keyof AugmentedPR,
      label: 'Vote',
      sortable: false,
      searchable: false,
      align: 'center',
      render: (_v, row) => votesLoaded ? voteCell(row) : null,
    },
  ]

  const augmented = useMemo<AugmentedPR[]>(() =>
    data.map(pr => {
      const overrides = localOverrides.get(pr.id) ?? {}
      const merged = { ...pr, ...overrides }
      return { ...merged, oasis_status: getOASISStatus(merged) }
    }),
    [data, localOverrides]
  )

  const filtered = useMemo(() =>
    filter === 'all' ? augmented : augmented.filter(pr => pr.oasis_status === filter),
    [augmented, filter]
  )

  if (loading) return <div className="tab-loading">Loading PRs…</div>

  return (
    <>
      {/* OASIS Stamp of Trust — toggleable panel */}
      <div className="stamp-info-bar">
        <span className="stamp-info-summary">
          <strong>OASIS Stamp of Trust</strong> — criteria for the <em>Trusted</em> status
        </span>
        <button
          className="rep-info-toggle"
          onClick={() => setShowStamp(s => !s)}
          aria-expanded={showStamp}
        >
          ⓘ {showStamp ? 'Hide criteria' : 'Show criteria'}
        </button>
      </div>

      {showStamp && (
        <div className="stamp-criteria-card">
          <div className="todo-banner" style={{ marginBottom: 14 }}>
            <span className="todo-badge">TODO</span>
            <div>
              These criteria are a <strong>stub</strong>. Thresholds will be reviewed
              and ratified by the OASIS community before they carry formal weight.
            </div>
          </div>
          <h4>Current criteria for <span className="state-badge state-trusted" style={{ fontSize: '0.8rem' }}>Trusted</span></h4>
          <ul>
            <li>
              <strong>{TRUST_MIN_CONTRIBUTORS}+ participants</strong> have interacted with the PR
            </li>
            <li>
              <strong>{Math.round(TRUST_MIN_ACCEPT_RATE * 100)}%+ of votes</strong> are Accept
              (i.e. consensus_accept / total_votes ≥ {TRUST_MIN_ACCEPT_RATE})
            </li>
            <li>
              The PR is <strong>still open</strong> in the fork — Rejected and Accepted PRs are excluded
            </li>
          </ul>
          <p className="stamp-criteria-note">
            A <em>Trusted</em> PR is considered ready for OASIS project owners to evaluate for
            upstream submission. Meeting the threshold does not guarantee submission — that decision
            remains with the project owners.
          </p>
        </div>
      )}

      <div className="pr-filter-bar">
        <span className="pr-filter-label">Show:</span>
        {FILTER_MODES.map(({ id, label }) => (
          <button
            key={id}
            className={`pr-filter-btn${filter === id ? ' pr-filter-btn--active' : ''}`}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <SortableTable
        columns={columns}
        data={filtered}
        defaultSort="updated_at"
        defaultDir="desc"
        rowKey="id"
        searchPlaceholder="Filter by repo or title…"
        emptyMessage="No PRs match this filter."
      />

      {modalPR && (
        <VoteModal
          pr={modalPR}
          onClose={() => setModalPR(null)}
          onSuccess={(decision) => handleVoteSuccess(modalPR, decision)}
        />
      )}
    </>
  )
}
