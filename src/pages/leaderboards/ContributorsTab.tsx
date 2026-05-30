import { useState } from 'react'
import SortableTable from '../../components/SortableTable'
import type { Column } from '../../components/SortableTable'
import ColHeader from '../../components/ColHeader'
import ContributorPanel from '../../components/ContributorPanel/ContributorPanel'

interface Contributor {
  login: string
  avatar_url: string | null
  prs_worked: number
  total_interactions: number
  non_oasis_interactions: number
  reactions_received: number
  reactions_given: number
  accepts: number
  modifies: number
  rejects: number
  base_reputation: number
  modified_reputation: number
  rank_90d: number | null
  rank_90d_oldest_activity: string | null
  avg_per_pr: number
}

const columns: Column<Contributor>[] = [
  {
    key: 'login',
    label: 'Contributor',
    render: (v, row) => (
      <div className="contributor-cell">
        <img
          src={String(row.avatar_url ?? `https://github.com/${v}.png?size=32`)}
          alt=""
          className="contributor-avatar"
          width={28}
          height={28}
        />
        <span className="contributor-login">{String(v)}</span>
      </div>
    ),
  },
  {
    key: 'prs_worked',
    label: <ColHeader icon="📋" label="PRs worked on" />,
    sortable: true,
    searchable: false,
    align: 'right',
  },
  {
    key: 'accepts',
    label: <ColHeader icon="✅" label="Accept votes" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="consensus-accept">{String(v)}</span>,
  },
  {
    key: 'modifies',
    label: <ColHeader icon="⚠️" label="Modify votes" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="consensus-modify">{String(v)}</span>,
  },
  {
    key: 'rejects',
    label: <ColHeader icon="👎" label="Reject votes" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="consensus-reject">{String(v)}</span>,
  },
  // ── Scoring columns ──────────────────────────────────────────
  {
    key: 'base_reputation',
    label: <ColHeader icon="⚙️" label="Base reputation (comment + peer + reaction + trust)" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="col-banded">{Number(v).toFixed(2)}</span>,
  },
  {
    key: 'modified_reputation',
    label: <ColHeader icon="🏆" label="Modified reputation (base × bonus multiplier)" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="reputation-score col-banded">{Number(v).toFixed(2)}</span>,
  },
  {
    key: 'rank_90d',
    label: <ColHeader icon="📅" label="90-Day rank" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) =>
      v == null
        ? <span className="col-banded muted">—</span>
        : <span className="col-banded">#{String(v)}</span>,
  },
  // ── Activity columns ─────────────────────────────────────────
  {
    key: 'total_interactions',
    label: <ColHeader icon="🗳" label="OASIS comment count" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="col-banded">{String(v)}</span>,
  },
  {
    key: 'reactions_received',
    label: <ColHeader icon="⭐" label="Reactions received on your comments" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="col-banded">{String(v)}</span>,
  },
  {
    key: 'reactions_given',
    label: <ColHeader icon="👍" label="Reactions you gave on others' comments" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="col-banded">{String(v)}</span>,
  },
  {
    key: 'avg_per_pr',
    label: <ColHeader icon="📊" label="Average interactions per PR" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="col-banded">{Number(v).toFixed(1)}</span>,
  },
]

interface Props { data: Contributor[]; loading: boolean }

export default function ContributorsTab({ data, loading }: Props) {
  const [showFormula, setShowFormula] = useState(false)
  const [activeLogin, setActiveLogin] = useState<string | null>(null)

  if (loading) return <div className="tab-loading">Loading contributors…</div>

  return (
    <>
      {/* Reputation info bar */}
      <div className="rep-info-bar">
        <span className="rep-info-summary">
          <strong>Modified Reputation</strong> = (comment + peer + reaction + trust) × bonus multiplier.
          Click any row to see full score breakdown.
        </span>
        <button
          className="rep-info-toggle"
          onClick={() => setShowFormula(f => !f)}
          aria-expanded={showFormula}
        >
          ⓘ {showFormula ? 'Hide formula' : 'Show formula'}
        </button>
      </div>

      {showFormula && (
        <div className="rep-formula-card">
          <h4>Reputation Formula</h4>
          <code className="rep-formula">
            base = comment_score + peer_score + reaction_score + trust_score{'\n'}
            modified = base × (1 + early_mover + early_bird + influencer bonuses)
          </code>
          <ul>
            <li><strong>comment_score</strong> — 1 point per OASIS-template comment posted</li>
            <li><strong>peer_score</strong> — reactions received on your comments: +0.35 (positive), −0.25 (negative)</li>
            <li><strong>reaction_score</strong> — reactions you gave on others' comments: min(count, 5) × 0.25</li>
            <li><strong>trust_score</strong> — 10 × PRs where you voted Accept and the PR merged upstream</li>
            <li><strong>early_mover_bonus</strong> — up to +0.20 for being among the first to comment on a PR</li>
            <li><strong>early_bird_bonus</strong> — +0.25 if commented within 24h of PR creation; +0.10 within 96h</li>
            <li><strong>influencer_bonus</strong> — +0.10 most total reactions / +0.20 most positive / −0.50 most negative on a PR</li>
          </ul>
          <p className="rep-formula-note">Click any row to open the full score breakdown panel.</p>
        </div>
      )}

      <SortableTable
        columns={columns}
        data={data}
        defaultSort="modified_reputation"
        defaultDir="desc"
        rowKey="login"
        searchPlaceholder="Filter by username…"
        emptyMessage="No contributor data yet. Sync will populate this shortly."
        onRowClick={(row) => setActiveLogin(row.login)}
        activeRowKey={activeLogin ?? undefined}
      />

      {/* Contributor detail slide-out panel */}
      <ContributorPanel
        login={activeLogin}
        onClose={() => setActiveLogin(null)}
      />
    </>
  )
}
