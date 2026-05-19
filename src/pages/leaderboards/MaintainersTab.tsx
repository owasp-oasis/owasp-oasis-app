import SortableTable from '../../components/SortableTable'
import type { Column } from '../../components/SortableTable'
import ColHeader from '../../components/ColHeader'

interface Maintainer {
  repo_name: string
  upstream_url: string | null
  total_submitted: number
  total_merged: number
  merge_rate: number
  total_accept_consensus: number
}

const columns: Column<Maintainer>[] = [
  {
    key: 'repo_name',
    label: 'OASIS Repo',
    render: (v) => (
      <a href={`https://github.com/owasp-oasis/${v}`} target="_blank" rel="noopener noreferrer">
        {String(v)}
      </a>
    ),
  },
  {
    key: 'upstream_url',
    label: 'Upstream Project',
    render: (v) => v
      ? <a href={String(v)} target="_blank" rel="noopener noreferrer">{String(v).replace('https://github.com/', '')}</a>
      : '—',
  },
  {
    key: 'total_submitted',
    label: <ColHeader icon="📤" label="PRs submitted upstream" />,
    sortable: true,
    searchable: false,
    align: 'right',
  },
  {
    key: 'total_merged',
    label: <ColHeader icon="✅" label="PRs merged upstream" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => (
      <span style={{ color: Number(v) > 0 ? '#1a7a2e' : 'inherit', fontWeight: Number(v) > 0 ? 700 : 400 }}>
        {String(v)}
      </span>
    ),
  },
  {
    key: 'merge_rate',
    label: <ColHeader icon="📈" label="Merge rate (merged / submitted %)" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => `${Number(v).toFixed(1)}%`,
  },
  {
    key: 'total_accept_consensus',
    label: <ColHeader icon="🏆" label="Total Accept consensus votes across all PRs" />,
    sortable: true,
    searchable: false,
    align: 'right',
    render: (v) => <span className="consensus-accept">{String(v)}</span>,
  },
]

interface Props { data: Maintainer[]; loading: boolean }

export default function MaintainersTab({ data, loading }: Props) {
  if (loading) return <div className="tab-loading">Loading maintainer data…</div>

  return (
    <>
      <div className="todo-banner">
        <span className="todo-badge">TODO</span>
        <div>
          <strong>This dashboard needs a redesign.</strong> The current data — submitted vs merged PR
          counts — doesn't yet tell a useful story about maintainer impact. Once OASIS PRs start being
          accepted upstream, we'll revisit this tab to surface meaningful signals: which maintainers
          are most responsive, which projects are best-aligned with OASIS contributions, and how
          maintainer engagement correlates with upstream acceptance rates.
        </div>
      </div>
      <p className="tab-note">
        Upstream merge detection compares OASIS PR commit SHAs against the upstream default branch.
        Time-to-merge metrics will appear once PRs are successfully merged upstream.
      </p>
      <SortableTable
        columns={columns}
        data={data}
        defaultSort="merge_rate"
        defaultDir="desc"
        rowKey="repo_name"
        searchPlaceholder="Filter by repo name…"
        emptyMessage="No upstream merge data yet."
      />
    </>
  )
}
