import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { DashboardData } from '../../worker/dashboardTypes'
import { useAuth } from '../context/AuthContext'
import './Dashboard.css'

const LIVE_REFRESH_MS = 60_000
const LIVE_PREFERENCE_KEY = 'oasis.dashboard.liveUpdates'

const formatNumber = (value: number) => value.toLocaleString('en-US')
function formatDate(value: string | null, withTime = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not yet synced'
  return new Intl.DateTimeFormat('en', withTime
    ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}

function describeInterval(seconds: number) {
  if (seconds % 3600 === 0) return seconds === 3600 ? 'every hour' : `every ${seconds / 3600} hours`
  return `every ${Math.round(seconds / 60)} minutes`
}

function readLivePreference() {
  try { return localStorage.getItem(LIVE_PREFERENCE_KEY) === '1' } catch { return false }
}

async function fetchDashboard(url: string, signal: AbortSignal, live: boolean) {
  const response = await fetch(url, { signal, credentials: 'same-origin', ...(live ? { cache: 'no-store' as const } : {}) })
  const payload = await response.json() as DashboardData
  if (!response.ok || payload.ok !== true || !payload.totals || !Array.isArray(payload.trend?.points) || !Array.isArray(payload.activity?.days) || !Array.isArray(payload.projects) || !Array.isArray(payload.recent_fixes)) throw new Error('Unavailable')
  return payload
}

function CandidateChart({ trend }: { trend: DashboardData['trend'] }) {
  const max = Math.max(...trend.points.map(point => point.count), 1)
  const points = trend.points.map((point, index) => ({ ...point, x: 18 + index * 464 / Math.max(1, trend.points.length - 1), y: 164 - point.count / max * 132 }))
  const coords = points.map(point => `${point.x},${point.y}`).join(' ')
  return <>
    <div className="line-chart" role="group" aria-label="Cumulative candidate fixes created in the selected period">
      <div className="line-chart-plot">
        <svg viewBox="0 0 500 190" preserveAspectRatio="none" aria-hidden="true">
          {[32, 76, 120, 164].map(y => <line key={y} x1="18" y1={y} x2="482" y2={y} className="chart-grid" />)}
          <polygon points={`18,164 ${coords} 482,164`} className="chart-area" />
          <polyline points={coords} className="chart-line" />
        </svg>
        {points.map((point, i) => <button key={i} className="chart-hotspot" style={{ left: `${point.x / 5}%`, top: `${point.y / 1.9}%` }} aria-label={`${formatDate(point.date)}: ${point.count} candidate fixes created since ${formatDate(trend.from)}`}>
          <span className="chart-tooltip" aria-hidden="true"><strong>{formatDate(point.date)}</strong><small>{point.count} candidate fixes</small></span>
        </button>)}
      </div>
      <div className="chart-axis"><span>{formatDate(trend.from)}</span><span>{formatDate(trend.to)}</span></div>
    </div>
    <p className="panel-footnote">{formatNumber(points[points.length - 1]?.count ?? 0)} created in this period. Cumulative counts by creation date, through today (UTC).</p>
  </>
}

function Votes({ totals }: { totals: DashboardData['totals'] }) {
  const entries = [['Accept', totals.accept, '#4cd964'], ['Modify', totals.modify, '#55a7ff'], ['Reject', totals.reject, '#ff7a7a'], ['Duplicate', totals.duplicate, '#9b85ff']] as const
  let offset = 0
  const stops = entries.flatMap(([, value, color]) => {
    const start = offset
    offset += value / Math.max(totals.votes, 1) * 100
    return [`${color} ${start}%`, `${color} ${offset}%`]
  }).join(', ')
  return <div className="donut-wrap">
    <div className="decision-donut" style={{ background: totals.votes ? `conic-gradient(${stops})` : 'var(--dash-line)' }} role="img" aria-label={`${totals.votes} recorded votes`}>
      <div><strong>{formatNumber(totals.votes)}</strong><span>votes</span></div>
    </div>
    <ul className="donut-legend">{entries.map(([label, value, color]) => <li key={label}><span className="legend-dot" style={{ background: color }} /><span>{label}</span><strong>{formatNumber(value)}</strong></li>)}</ul>
  </div>
}

export default function Dashboard() {
  const [params, setParams] = useSearchParams()
  const requestedRange = params.get('range')
  const range = requestedRange === '30' || requestedRange === 'all' ? requestedRange : '90'
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const { user, loading: authLoading } = useAuth()
  // Admins read live D1 totals; everyone else shares the server's periodic snapshot.
  const isAdmin = user?.role === 'admin'
  const url = `${isAdmin ? '/api/admin/dashboard' : '/api/dashboard'}?range=${range}`
  const [liveUpdates, setLiveUpdates] = useState(readLivePreference)
  const toggleLiveUpdates = (enabled: boolean) => {
    setLiveUpdates(enabled)
    try { localStorage.setItem(LIVE_PREFERENCE_KEY, enabled ? '1' : '0') } catch { /* The toggle still works for this visit. */ }
  }
  useEffect(() => {
    if (authLoading) return
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setData(null)
    void fetchDashboard(url, controller.signal, isAdmin)
      .then(payload => { if (!controller.signal.aborted) setData(payload) })
      .catch(() => { if (!controller.signal.aborted) setError('Dashboard data is temporarily unavailable. Please try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [authLoading, url, isAdmin, revision])
  useEffect(() => {
    if (!isAdmin || !liveUpdates) return
    let controller: AbortController | null = null
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      controller?.abort()
      const current = controller = new AbortController()
      // Background refreshes keep the last good figures on screen if a request fails.
      void fetchDashboard(url, current.signal, true)
        .then(payload => { if (!current.signal.aborted) { setData(payload); setError('') } })
        .catch(() => undefined)
    }, LIVE_REFRESH_MS)
    return () => { window.clearInterval(timer); controller?.abort() }
  }, [isAdmin, liveUpdates, url])

  const stale = data && (!data.last_synced_at || Date.now() - Date.parse(data.last_synced_at) > 8 * 3_600_000)
  return <div className="oasis-dashboard">
    <section className="dashboard-hero">
      <div className="dashboard-shell">
        <div className="dashboard-hero-meta"><span className="dashboard-kicker">OASIS // Community security signal</span>{isAdmin && <div className="dashboard-admin-controls">
          <label className="dashboard-live-toggle"><input type="checkbox" checked={liveUpdates} onChange={event => toggleLiveUpdates(event.target.checked)} />Live updates (every 60s)</label>
          <button className="dashboard-refresh" disabled={loading} onClick={() => setRevision(n => n + 1)}>{loading ? 'Loading…' : 'Refresh data'}</button>
        </div>}</div>
        <div className="dashboard-hero-body"><div><h1>OWASP OASIS<br /><span>Status Dashboard</span></h1><p>Community participation, candidate fixes, and recorded review outcomes.</p></div></div>
        {data && <div className="dashboard-freshness">
          {data.source === 'live'
            ? <p>Live database totals fetched {formatDate(data.generated_at, true)}{liveUpdates ? ' · Updating every 60 seconds' : ''}.</p>
            : <p>Database totals as of {formatDate(data.generated_at, true)}{data.refresh_seconds ? ` · Public figures refresh ${describeInterval(data.refresh_seconds)}` : ''}.</p>}
          <p className={stale ? 'dashboard-stale' : ''}>GitHub last synced {formatDate(data.last_synced_at, true)}{data.sync_running ? ' · Sync in progress' : ''}{stale ? ' · Review data may be out of date' : ''}. <Link to="/workspace/sync">Sync status</Link></p>
        </div>}
      </div>
    </section>
    {loading && <p className="dashboard-empty" role="status">Loading dashboard data…</p>}
    {error && <div className="dashboard-empty" role="alert"><p>{error}</p><button className="dashboard-refresh" onClick={() => setRevision(n => n + 1)}>Try again</button></div>}
    {data && <>
      <section className="dashboard-metrics" aria-label="OASIS at a glance">
        <div className="dashboard-shell dashboard-metrics-shell">
          <div className="active-validators-heading">
            <div><strong>{formatNumber(data.totals.registrations)}</strong><span>Community registrations</span></div>
            <div><strong>{formatNumber(data.totals.active_reviewers_90d)}</strong><span>Reviewers who voted · 90 days</span></div>
          </div>
          <div className="metric-grid">{[
            ['Forked projects', data.totals.projects, 'Active projects tracked in OASIS'],
            ['Recorded votes', data.totals.votes, 'All-time retained reviewer votes'],
            ['Candidate fixes', data.totals.candidates, 'Open and closed'],
            ['Community trusted', data.totals.trusted, 'Open fixes meeting threshold'],
            ['Upstream accepted', data.totals.accepted, 'Closed and marked merged'],
          ].map(([label, value, note], i) => <article className={`metric-card metric-card--${i + 1}`} key={label}><span>{label}</span><strong>{formatNumber(Number(value))}</strong><small>{note}</small></article>)}</div>
        </div>
      </section>
      <div className="dashboard-shell dashboard-content">
        <p className="dashboard-scope">Registrations include signup-form and GitHub sign-in registrations. Project totals include every active fork tracked in OASIS, even those without candidate fixes. Fix status counts cover non-deleted fixes in active projects; vote totals include all retained reviewer votes.</p>
        <div className="dashboard-grid dashboard-grid--wide">
          <section className="dashboard-panel">
            <div className="panel-heading"><h2>Candidate fixes created</h2><div className="range-control" aria-label="Chart range">{['30', '90', 'all'].map(value => <button key={value} aria-pressed={range === value} className={range === value ? 'active' : ''} onClick={() => setParams({ range: value })}>{value === 'all' ? 'All' : `${value}d`}</button>)}</div></div>
            <CandidateChart trend={data.trend} />
          </section>
          <section className="dashboard-panel">
            <div className="panel-heading"><h2>Current fix status</h2></div>
            <div className="pipeline">{[
              ['Needs review', data.totals.needs_review, '#ffcc55'], ['Community trusted', data.totals.trusted, '#9b85ff'], ['Upstream accepted', data.totals.accepted, '#4cd964'], ['Other closed fixes', data.totals.closed, '#ff7a7a'],
            ].map(([label, value, color]) => <div className="pipeline-row" key={label}><div><span>{label}</span><strong>{formatNumber(Number(value))}</strong></div><div className="pipeline-track"><i style={{ width: `${Number(value) / Math.max(data.totals.candidates, 1) * 100}%`, background: String(color) }} /></div></div>)}</div>
            <p className="panel-footnote">Trust uses the Workspace threshold: 10+ participants and at least 75% Accept among Accept, Modify and Reject votes. Maintainers decide whether to merge.</p>
          </section>
        </div>
        <div className="dashboard-grid dashboard-grid--equal">
          <section className="dashboard-panel">
            <div className="panel-heading"><h2>Forked projects by candidate volume</h2><Link to="/workspace/projects">All projects</Link></div>
            <div className="project-bars">{data.projects.map(project => <div className="project-bar-row" key={project.id}>
              <div className="project-bar-label"><Link to={`/workspace/fixes?repo=${project.id}&all=1&filter=all`}>{project.name}</Link></div>
              <div className="project-bar-track" tabIndex={0} role="img" aria-label={`${project.name}: ${project.accepted} accepted, ${project.trusted} trusted, ${project.needs_review} need review, ${project.closed} other closed, ${project.candidates} total`}>
                <i className="accepted" style={{ width: `${project.accepted / project.candidates * 100}%` }} /><i className="trusted" style={{ width: `${project.trusted / project.candidates * 100}%` }} /><i className="review" style={{ width: `${project.needs_review / project.candidates * 100}%` }} /><i className="closed" style={{ width: `${project.closed / project.candidates * 100}%` }} />
                <span className="project-tooltip" aria-hidden="true"><strong>{project.name}</strong><small>{project.accepted} accepted · {project.trusted} trusted<br />{project.needs_review} need review · {project.closed} other closed</small></span>
              </div><strong className="project-total">{formatNumber(project.candidates)}</strong>
            </div>)}</div>
            {!data.projects.length && <p className="dashboard-empty">No active forked projects are tracked yet.</p>}
            <div className="mini-legend"><span><i className="accepted" />Accepted</span><span><i className="trusted" />Trusted</span><span><i className="review" />Needs review</span><span><i className="closed" />Closed</span></div>
          </section>
          <section className="dashboard-panel">
            <div className="panel-heading"><h2>All-time community votes</h2></div><Votes totals={data.totals} />
            <p className="panel-footnote">Recorded reviewer votes, including votes imported from GitHub. Automated validator comments and ordinary discussion are excluded.</p>
          </section>
        </div>
        <section className="dashboard-panel dashboard-activity">
          <div className="panel-heading"><h2>Review activity</h2><span className="panel-heading-note">Last 84 days · UTC</span></div>
          <div className="dashboard-activity-grid" aria-label="Recorded votes by date">{data.activity.days.map(day => <button className="heatmap-cell" key={day.date} data-level={day.votes === 0 ? 0 : day.votes < 4 ? 1 : day.votes < 8 ? 2 : day.votes < 13 ? 3 : 4} aria-label={`${formatDate(day.date)}: ${day.votes} recorded votes`}>
            <span className="heatmap-tooltip" aria-hidden="true"><strong>{formatDate(day.date)}</strong><small>{day.votes} recorded votes</small></span>
          </button>)}</div>
          <div className="chart-axis"><span>{formatDate(data.activity.from)}</span><span>{formatDate(data.activity.to)}</span></div>
          <p className="panel-footnote">Each square is one day, read left to right by row. Counts use recorded vote dates, not PR update dates. Includes today’s partial day.</p>
        </section>
        <section className="dashboard-panel dashboard-ledger">
          <div className="panel-heading ledger-heading"><h2>Recently updated fixes</h2><Link to="/workspace/fixes?all=1&filter=all">Browse all {formatNumber(data.totals.candidates)} fixes</Link></div>
          <div className="ledger-table-wrap"><table className="ledger-table"><thead><tr><th>Project / fix</th><th>Status</th><th>Updated</th></tr></thead><tbody>{data.recent_fixes.map(fix => <tr key={fix.id}>
            <td><Link to={`/workspace/fixes/${encodeURIComponent(fix.repo_name)}/${fix.number}?all=1&filter=all`}><span className="ledger-project-line">{fix.repo_name} #{fix.number}</span><strong>{fix.title}</strong></Link></td>
            <td><span className={`dashboard-status status-${fix.status.toLowerCase().replace(/\s+/g, '-')}`}>{fix.status}</span></td><td>{formatDate(fix.updated_at)}</td>
          </tr>)}</tbody></table></div>
          {!data.recent_fixes.length && <p className="dashboard-empty">No candidate fixes recorded yet.</p>}
          <p className="panel-footnote dashboard-ledger-note">Up to ten recently updated fixes. Summary totals include the entire current collection.</p>
        </section>
      </div>
    </>}
  </div>
}
