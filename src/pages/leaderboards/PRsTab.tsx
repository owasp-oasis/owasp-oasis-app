import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import SortableTable from '../../components/SortableTable'
import type { Column } from '../../components/SortableTable'
import ColHeader from '../../components/ColHeader'
import PRPanel, { type PanelPR } from '../../components/PRPanel/PRPanel'
import type { Decision } from '../../components/VoteForm'
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

const VOTE_LABEL: Record<Decision, string> = {
  accept: '✓ Accept',
  modify: '⚠ Modify',
  reject: '✗ Reject',
  duplicate: '🔀 Duplicate',
}

/** Returns CSS class(es) for row highlighting based on vote state and crowd agreement. */
function getRowClass(pr: AugmentedPR, myVote: Decision | undefined): string {
  const classes: string[] = []

  if (myVote) {
    classes.push(`pr-row-voted--${myVote}`)

    const total = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject
    if (total > 1) {
      const counts: Record<Decision, number> = {
         accept: pr.consensus_accept,
         modify: pr.consensus_modify,
         reject: pr.consensus_reject,
         duplicate: 0,  // not included in consensus comparison in getRowClass
       }
      const max = Math.max(...Object.values(counts))
      const leaders = (Object.entries(counts) as [Decision, number][]).filter(([, v]) => v === max)
      if (leaders.length === 1) {
        const crowdLeader = leaders[0][0]
        classes.push(myVote === crowdLeader ? 'pr-row-agree' : 'pr-row-disagree')
      }
    }
  }

  return classes.join(' ')
}

type OASISStatus = 'Needs Review' | 'Trusted' | 'Withdrawn' | 'Rejected' | 'Accepted'

function getOASISStatus(pr: PR): OASISStatus {
  if (pr.merged_upstream && pr.state === 'closed') return 'Accepted'
  if (pr.state === 'closed') {
    if (pr.consensus_accept > 0) return 'Withdrawn'
    return 'Rejected'
  }
  const totalVotes = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject
  const acceptRate = totalVotes > 0 ? pr.consensus_accept / totalVotes : 0
  if (pr.participants >= TRUST_MIN_CONTRIBUTORS && acceptRate >= TRUST_MIN_ACCEPT_RATE) return 'Trusted'
  return 'Needs Review'
}

function StatusBadge({ status }: { status: OASISStatus }) {
  const cls: Record<OASISStatus, string> = {
    'Needs Review': 'state-badge state-needs-review',
    'Trusted':      'state-badge state-trusted',
    'Withdrawn':    'state-badge state-withdrawn',
    'Rejected':     'state-badge state-closed',
    'Accepted':     'state-badge state-merged',
  }
  return <span className={cls[status]}>{status}</span>
}

const STATUS_DEFINITIONS: { status: OASISStatus; cls: string; description: string; todo?: boolean }[] = [
  {
    status: 'Accepted',
    cls: 'state-merged',
    description: 'The fix was merged into the upstream repository and the fork PR is closed.',
  },
  {
    status: 'Trusted',
    cls: 'state-trusted',
    description: `Open PR that meets the trust threshold (${TRUST_MIN_CONTRIBUTORS}+ participants, ${Math.round(TRUST_MIN_ACCEPT_RATE * 100)}%+ acceptance votes). Ready to be considered for upstream submission.`,
  },
  {
    status: 'Needs Review',
    cls: 'state-needs-review',
    description: 'Open PR in the OASIS fork that has not yet reached the minimum criteria for an OASIS Stamp of Trust.',
  },
  {
    status: 'Withdrawn',
    cls: 'state-withdrawn',
    description: 'The OASIS community voted to accept this finding. The fork PR was closed without a confirmed upstream merge — the fix may have landed via a separate PR or commit.',
  },
  {
    status: 'Rejected',
    cls: 'state-closed',
    description: 'The fork PR was closed with no accept votes recorded. The fix was not adopted.',
  },
]

function StatusKey() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
          <div className="status-key-trust-criteria">
            <h4>Trusted criteria <span className="todo-badge" style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}>TODO</span></h4>
            <ul>
              <li><strong>{TRUST_MIN_CONTRIBUTORS}+ participants</strong> have interacted with the PR</li>
              <li><strong>{Math.round(TRUST_MIN_ACCEPT_RATE * 100)}%+ of votes</strong> are Accept</li>
              <li>The PR is <strong>still open</strong> in the fork</li>
            </ul>
            <p className="status-key-stub-note">
              Thresholds are a stub — they will be reviewed and ratified by the OASIS community.
            </p>
          </div>
          <div className="status-key-priority-ranking">
            <h4>Priority ranking</h4>
            <p className="status-key-ranking-chain">
              Accepted <span className="ranking-arrow">›</span> Trusted <span className="ranking-arrow">›</span> Needs Review <span className="ranking-arrow">›</span> Withdrawn <span className="ranking-arrow">›</span> Rejected
            </p>
            <p className="status-key-ranking-note">
              Accepted represents the highest value outcome; Rejected represents the lowest. This ranking reflects the trust and engagement signaled by each status.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/** Compact stacked consensus bar + total count for use in the table cell. */
function ConsensusMiniBar({ accept, modify, reject, oasisVotes, nonOasisVotes }: {
  accept: number
  modify: number
  reject: number
  oasisVotes: number
  nonOasisVotes: number
}) {
  const total = accept + modify + reject
  const tooltip = `Accept: ${accept} | Modify: ${modify} | Reject: ${reject}\nOASIS votes: ${oasisVotes} | Non-OASIS: ${nonOasisVotes}`
  return (
    <div className="consensus-mini-wrap" title={tooltip}>
      {total > 0 ? (
        <div className="consensus-bar consensus-bar--mini">
          {accept > 0 && <div className="cb-accept" style={{ flex: accept }} />}
          {modify > 0 && <div className="cb-modify" style={{ flex: modify }} />}
          {reject > 0 && <div className="cb-reject" style={{ flex: reject }} />}
        </div>
      ) : (
        <div className="consensus-bar consensus-bar--mini consensus-bar--empty" />
      )}
      <span className="consensus-mini-count">{total} {total === 1 ? 'vote' : 'votes'}</span>
    </div>
  )
}

type FilterMode = 'all' | OASISStatus | 'needs-my-vote'
const BASE_FILTER_MODES: { id: FilterMode; label: string }[] = [
  { id: 'all',          label: 'All PRs' },
  { id: 'Accepted',     label: 'Accepted' },
  { id: 'Trusted',      label: 'Trusted' },
  { id: 'Needs Review', label: 'Needs Review' },
  { id: 'Withdrawn',    label: 'Withdrawn' },
  { id: 'Rejected',     label: 'Rejected' },
]

type AugmentedPR = PR & { oasis_status: OASISStatus }

type VoteMap = Map<number, Decision>

interface Props {
  data: PR[]
  loading: boolean
  initialRepoFilter?: string | null
  initialLanguages?: string[]
  initialSeverities?: string[]
  onRepoFilterChange?: (repoName: string | null) => void
}

export default function PRsTab({
  data,
  loading,
  initialRepoFilter,
  initialLanguages = [],
  initialSeverities = [],
  onRepoFilterChange,
}: Props) {
  const [filter, setFilter] = useState<FilterMode>('needs-my-vote')
  const { user } = useAuth()

  // My votes state
  const [myVotes, setMyVotes] = useState<VoteMap>(new Map())

  // Panel state — which PR is open in the side panel
  const [panelPR, setPanelPR] = useState<AugmentedPR | null>(null)

  // Repo filter state
  const [repoFilter, setRepoFilter] = useState<string | null>(null)

  // Language and severity filter state (from onboarding) — reserved for future filtering implementation
  const [_languageFilter] = useState<string[]>(initialLanguages)
  const [_severityFilter] = useState<string[]>(initialSeverities)

  // Local PR overrides for optimistic updates (consensus counts)
  const [localOverrides, setLocalOverrides] = useState<Map<number, Partial<PR>>>(new Map())

  const fetchMyVotes = useCallback(async () => {
    if (!user) { setMyVotes(new Map()); return }
    try {
      const res = await fetch('/api/votes/mine', { credentials: 'include' })
      if (!res.ok) return
      const d = await res.json() as { ok: boolean; votes: { pr_id: number; decision: string }[] }
      const map: VoteMap = new Map()
      for (const v of d.votes ?? []) {
        map.set(v.pr_id, v.decision as Decision)
      }
      setMyVotes(map)
    } catch { /* non-fatal */ }
  }, [user])

  useEffect(() => { fetchMyVotes() }, [fetchMyVotes])

  // Sync with initialRepoFilter prop
  useEffect(() => {
    setRepoFilter(initialRepoFilter ?? null)
  }, [initialRepoFilter])

  const projects = useMemo(
    () => [...new Set(data.map(pr => pr.repo_name))].sort((a, b) => a.localeCompare(b)),
    [data],
  )

  const selectProject = useCallback((repoName: string | null) => {
    setRepoFilter(repoName)
    onRepoFilterChange?.(repoName)
  }, [onRepoFilterChange])

  // If user signs out while on the needs-my-vote filter, fall back to 'all'
  useEffect(() => {
    if (!user && filter === 'needs-my-vote') setFilter('all')
  }, [user, filter])

  function handleVoteSuccess(pr: PanelPR, decision: Decision) {
    setMyVotes(prev => new Map(prev).set(pr.id, decision))
    setLocalOverrides(prev => {
      const next = new Map(prev)
      const base = data.find(p => p.id === pr.id)
      const existing = next.get(pr.id) ?? {}
      next.set(pr.id, {
        ...existing,
        consensus_accept: ((base?.consensus_accept ?? 0) + (decision === 'accept' ? 1 : 0)),
        consensus_modify: ((base?.consensus_modify ?? 0) + (decision === 'modify' ? 1 : 0)),
        consensus_reject: ((base?.consensus_reject ?? 0) + (decision === 'reject' ? 1 : 0)),
        oasis_comment_count: (base?.oasis_comment_count ?? 0) + 1,
        participants: (base?.participants ?? 0) + 1,
      })
      return next
    })
  }

  function handleRowClick(pr: AugmentedPR) {
    if (panelPR?.id === pr.id) {
      setPanelPR(null)
    } else {
      setPanelPR(pr)
    }
  }

  const columns: Column<AugmentedPR>[] = [
    {
      key: 'title',
      label: 'Pull Request',
      render: (_v, row) => (
        <div className="pr-row-combined">
          <a
            className="pr-row-repo"
            href={`https://github.com/owasp-oasis/${row.repo_name}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
          >
            {row.repo_name}
          </a>
          <span className="pr-row-title" title={row.title}>
            #{row.number} {row.title}
          </span>
        </div>
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
    ...(user ? [{
      key: 'id' as keyof AugmentedPR,
      label: 'My Vote',
      sortable: false,
      searchable: false,
      align: 'center' as const,
      render: (_v: unknown, row: AugmentedPR) => {
        const vote = myVotes.get(row.id)
        if (!vote) return <span style={{ color: 'var(--gray-400)' }}>—</span>
        return (
          <span className={`my-vote-badge my-vote-badge--${vote}`}>
            {VOTE_LABEL[vote]}
          </span>
        )
      },
    }] : []),
    {
      key: 'consensus_accept',
      label: <ColHeader icon="📊" label="Consensus" />,
      sortable: true,
      searchable: false,
      align: 'left',
      render: (_v, row) => (
        <ConsensusMiniBar
          accept={row.consensus_accept}
          modify={row.consensus_modify}
          reject={row.consensus_reject}
          oasisVotes={row.oasis_comment_count}
          nonOasisVotes={row.non_oasis_comment_count}
        />
      ),
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
      label: '',
      sortable: false,
      searchable: false,
      align: 'right',
      render: () => <span className="row-chevron" aria-hidden="true">›</span>,
    },
  ]

  const augmented = useMemo<AugmentedPR[]>(() => {
    if (!Array.isArray(data)) return []
    return data.map(pr => {
      const overrides = localOverrides.get(pr.id) ?? {}
      const merged = { ...pr, ...overrides }
      return { ...merged, oasis_status: getOASISStatus(merged) }
    })
  }, [data, localOverrides])

  const needsMyVoteCount = useMemo(() =>
    user
      ? augmented.filter(pr =>
          (pr.oasis_status === 'Needs Review' || pr.oasis_status === 'Trusted') &&
          !myVotes.has(pr.id)
        ).length
      : 0,
    [augmented, myVotes, user]
  )

  const visibleFilters = useMemo(() => {
    if (!user) return BASE_FILTER_MODES
    return [
      { id: 'needs-my-vote' as FilterMode, label: `Needs My Vote (${needsMyVoteCount})` },
      ...BASE_FILTER_MODES,
    ]
  }, [user, needsMyVoteCount])

  const filtered = useMemo(() => {
    let result = augmented
    
    // Apply repo filter first
    if (repoFilter) {
      result = result.filter(pr => pr.repo_name === repoFilter)
    }
    
    // Apply status filter
    if (filter === 'needs-my-vote') {
      return result.filter(pr =>
        (pr.oasis_status === 'Needs Review' || pr.oasis_status === 'Trusted') &&
        !myVotes.has(pr.id)
      )
    }
    return filter === 'all' ? result : result.filter(pr => pr.oasis_status === filter)
  }, [augmented, filter, myVotes, repoFilter])

  const emptyMessage = useMemo(() => {
    if (filter === 'needs-my-vote') {
      return (
        <span>
          You&apos;ve reviewed all open PRs — great work!{' '}
          <button
            className="pr-empty-filter-link"
            onClick={() => setFilter('all')}
          >
            View all PRs
          </button>
        </span>
      )
    }
    return 'No PRs match this filter.'
  }, [filter])

  const filterBar = (
    <div className="pr-filter-bar">
      <div className="pr-project-filter">
        <label htmlFor="pr-project-filter">Project</label>
        <select
          id="pr-project-filter"
          value={repoFilter ?? ''}
          onChange={event => selectProject(event.target.value || null)}
        >
          <option value="">All projects</option>
          {projects.map(project => (
            <option key={project} value={project}>{project}</option>
          ))}
        </select>
      </div>
      <span className="pr-filter-divider" aria-hidden="true" />
      <span className="pr-filter-label">Quick filters:</span>
      {visibleFilters.map(({ id, label }) => (
        <button
          key={id}
          className={`pr-filter-btn${filter === id ? ' pr-filter-btn--active' : ''}${id === 'needs-my-vote' ? ' pr-filter-btn--mine' : ''}`}
          onClick={() => setFilter(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )

  if (loading) return <div className="tab-loading">Loading PRs…</div>

  return (
    <>
      <SortableTable
        columns={columns}
        data={filtered}
        defaultSort="updated_at"
        defaultDir="desc"
        rowKey="id"
        searchPlaceholder="Filter by repo or title…"
        emptyMessage={emptyMessage}
        onRowClick={handleRowClick}
        activeRowKey={panelPR?.id}
        rowClassName={(pr) => getRowClass(pr, myVotes.get(pr.id))}
        toolbarRight={filterBar}
      />

      {/* Side panel */}
      <PRPanel
        pr={panelPR}
        myVotes={myVotes}
        onClose={() => setPanelPR(null)}
        onVoteSuccess={handleVoteSuccess}
      />
    </>
  )
}
