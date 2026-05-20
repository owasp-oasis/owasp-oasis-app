import { useState } from 'react'
import SortableTable from '../../components/SortableTable'
import type { Column } from '../../components/SortableTable'
import ColHeader from '../../components/ColHeader'

interface Contributor {
  login: string
  avatar_url: string | null
  prs_worked: number
  total_interactions: number
  non_oasis_interactions: number
  reactions_received: number
  accepts: number
  modifies: number
  rejects: number
  reputation: number
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
        <a href={`https://github.com/${v}`} target="_blank" rel="noopener noreferrer">
          {String(v)}
        </a>
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
  // ── Scoring section (banded) ─────────────────────────────────
  {
    key: 'total_interactions',
    label: <ColHeader icon="🗳" label="OASIS interactions (votes + reactions given)" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="col-banded">{String(v)}</span>,
  },
  {
    key: 'non_oasis_interactions',
    label: <ColHeader icon="💬" label="Non-OASIS comments" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => (
      <span className="col-banded" style={{ color: Number(v) > 0 ? 'var(--muted)' : 'inherit' }}>
        {String(v)}
      </span>
    ),
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
    key: 'reputation',
    label: <ColHeader icon="🏆" label="Reputation score = interactions + (reactions × 0.25)" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="reputation-score col-banded">{Number(v).toFixed(2)}</span>,
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

  if (loading) return <div className="tab-loading">Loading contributors…</div>

  return (
    <>
      <div className="rep-info-bar">
        <span className="rep-info-summary">
          <strong>Reputation</strong> = interactions + (reactions received × 0.25)
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
            Reputation = total_interactions + (reactions_received × 0.25)
          </code>
          <ul>
            <li><strong>🗳 OASIS interactions</strong> — OASIS-template votes cast and reactions given on any PR (non-OASIS comments are tracked separately and do not count toward reputation)</li>
            <li><strong>⭐ Reactions received</strong> — reactions left by others on your comments; each adds 0.25 pts</li>
            <li><strong>📊 Avg / PR</strong> — total_interactions ÷ number of PRs worked on</li>
          </ul>
          <p className="rep-formula-todo">
            <strong>TODO:</strong> Weighted scoring based on validation accuracy, peer agreement,
            and credibility tier is planned. The current formula is a stub tracking raw activity.
          </p>
        </div>
      )}

      <SortableTable
        columns={columns}
        data={data}
        defaultSort="reputation"
        defaultDir="desc"
        rowKey="login"
        searchPlaceholder="Filter by username…"
        emptyMessage="No contributor data yet. Sync will populate this shortly."
      />
    </>
  )
}
