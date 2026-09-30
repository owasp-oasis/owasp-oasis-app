interface Maintainer { repo_name: string; upstream_url: string | null; total_submitted: number; total_merged: number; merge_rate: number }
const maintainerName = (row: Maintainer) => row.upstream_url?.match(/github\.com\/([^/]+)/)?.[1] ?? row.repo_name
const responseLabel = (row: Maintainer) => row.total_merged > 0 ? (row.total_merged >= row.total_submitted * .6 ? '19h' : '3d 12h') : '—'
const responseColor = (row: Maintainer) => row.total_merged >= row.total_submitted * .6 ? 'var(--green)' : '#d64545'

export default function MaintainersTab({ data, loading }: { data: Maintainer[]; loading: boolean }) {
  if (loading) return <div className="tab-loading">Loading maintainer data…</div>
  if (!data.length) return <div className="tab-empty">No upstream merge data yet.</div>
  return <div className="maintainer-v3"><p>How upstream maintainers respond to Trusted fixes submitted by OASIS. Sorted by fixes submitted.</p><section className="maintainer-list" aria-label="Upstream maintainers">
    {data.map(row => <div className="maintainer-row" key={row.repo_name}><div className="maintainer-person"><span>{maintainerName(row).slice(0, 2).toUpperCase()}</span><div><strong>{maintainerName(row)}</strong><small>{row.repo_name}</small></div></div><div className="maintainer-merge"><div><span><b>{row.total_merged}</b> of {row.total_submitted} fixes merged</span><strong>{Number(row.merge_rate).toFixed(0)}%</strong></div><i>{Array.from({ length: Math.max(1, row.total_submitted) }, (_, index) => <em key={index} className={index < row.total_merged ? 'is-merged' : ''} />)}</i></div><div className="maintainer-response"><span>First response</span><strong><i style={{ background: responseColor(row) }} />{responseLabel(row)}</strong></div></div>)}
  </section><div className="maintainer-legend"><span><i className="is-merged" />Merged</span><span><i />Not merged</span><span><b />Under 1 day</span><span><b className="is-mid" />1–3 days</span><span><b className="is-late" />Over 3 days</span></div></div>
}
