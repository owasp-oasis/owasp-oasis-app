import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import './Dashboard.css'

type DashboardPR = {
  id: number
  repo_id: number
  repo_name: string
  number: number
  title: string
  state: string
  author: string | null
  html_url: string
  participants: number
  consensus_accept: number
  consensus_modify: number
  consensus_reject: number
  consensus_duplicate?: number
  merged_upstream: number
  created_at: string
  updated_at: string
}

type DashboardRepo = {
  id: number
  name: string
  language: string | null
  total_prs: number
  total_accept: number
  total_modify: number
  total_reject: number
  total_duplicate: number
}

type DashboardContributor = {
  login: string
  avatar_url?: string | null
  prs_worked?: number
  total_interactions?: number
  accepts?: number
  modified_reputation?: number
}

type DashboardStatus = 'Awaiting review' | 'Community trusted' | 'Upstream accepted' | 'Closed'

const SNAPSHOT_DATE = '2026-09-08T16:30:00Z'

const demoPRs: DashboardPR[] = [
  { id: 1, repo_id: 1, repo_name: 'juice-shop', number: 421, title: 'Prevent stored XSS in product review rendering', state: 'open', author: 'oasis-fixbot', html_url: '#', participants: 14, consensus_accept: 12, consensus_modify: 1, consensus_reject: 1, merged_upstream: 0, created_at: '2026-06-04T10:00:00Z', updated_at: '2026-09-08T14:10:00Z' },
  { id: 2, repo_id: 1, repo_name: 'juice-shop', number: 422, title: 'Harden profile updates against CSRF', state: 'open', author: 'community-sec', html_url: '#', participants: 6, consensus_accept: 3, consensus_modify: 2, consensus_reject: 1, merged_upstream: 0, created_at: '2026-06-18T10:00:00Z', updated_at: '2026-09-07T18:05:00Z' },
  { id: 3, repo_id: 1, repo_name: 'juice-shop', number: 423, title: 'Redact order tokens from diagnostic logs', state: 'closed', author: 'oasis-fixbot', html_url: '#', participants: 13, consensus_accept: 11, consensus_modify: 2, consensus_reject: 0, merged_upstream: 1, created_at: '2026-07-02T10:00:00Z', updated_at: '2026-09-05T12:30:00Z' },
  { id: 4, repo_id: 2, repo_name: 'webgoat', number: 88, title: 'Parameterize lesson progress lookup', state: 'open', author: 'java-guardian', html_url: '#', participants: 4, consensus_accept: 1, consensus_modify: 2, consensus_reject: 1, merged_upstream: 0, created_at: '2026-07-13T10:00:00Z', updated_at: '2026-09-04T09:45:00Z' },
  { id: 5, repo_id: 2, repo_name: 'webgoat', number: 91, title: 'Reject unsafe file names in assignment upload', state: 'closed', author: 'oasis-fixbot', html_url: '#', participants: 17, consensus_accept: 15, consensus_modify: 2, consensus_reject: 0, merged_upstream: 1, created_at: '2026-07-23T10:00:00Z', updated_at: '2026-09-03T17:20:00Z' },
  { id: 6, repo_id: 3, repo_name: 'crapi', number: 17, title: 'Block internal network targets in webhook verifier', state: 'open', author: 'api-defender', html_url: '#', participants: 12, consensus_accept: 10, consensus_modify: 1, consensus_reject: 1, merged_upstream: 0, created_at: '2026-08-01T10:00:00Z', updated_at: '2026-09-02T13:40:00Z' },
  { id: 7, repo_id: 3, repo_name: 'crapi', number: 21, title: 'Enforce ownership checks on vehicle reports', state: 'open', author: 'oasis-fixbot', html_url: '#', participants: 7, consensus_accept: 4, consensus_modify: 2, consensus_reject: 1, merged_upstream: 0, created_at: '2026-08-09T10:00:00Z', updated_at: '2026-09-01T08:35:00Z' },
  { id: 8, repo_id: 4, repo_name: 'nodegoat', number: 144, title: 'Escape user-controlled values in account exports', state: 'closed', author: 'js-sec-lab', html_url: '#', participants: 11, consensus_accept: 9, consensus_modify: 1, consensus_reject: 1, merged_upstream: 1, created_at: '2026-08-15T10:00:00Z', updated_at: '2026-08-30T16:20:00Z' },
  { id: 9, repo_id: 4, repo_name: 'nodegoat', number: 147, title: 'Rotate session identifier after authentication', state: 'open', author: 'oasis-fixbot', html_url: '#', participants: 3, consensus_accept: 1, consensus_modify: 2, consensus_reject: 0, merged_upstream: 0, created_at: '2026-08-20T10:00:00Z', updated_at: '2026-08-29T11:05:00Z' },
  { id: 10, repo_id: 5, repo_name: 'pysap', number: 72, title: 'Bound decompression size for crafted packets', state: 'open', author: 'packet-sentinel', html_url: '#', participants: 15, consensus_accept: 13, consensus_modify: 1, consensus_reject: 1, merged_upstream: 0, created_at: '2026-08-24T10:00:00Z', updated_at: '2026-08-28T19:15:00Z' },
  { id: 11, repo_id: 5, repo_name: 'pysap', number: 75, title: 'Validate declared packet length before allocation', state: 'closed', author: 'packet-sentinel', html_url: '#', participants: 18, consensus_accept: 16, consensus_modify: 2, consensus_reject: 0, merged_upstream: 1, created_at: '2026-08-30T10:00:00Z', updated_at: '2026-09-06T10:40:00Z' },
  { id: 12, repo_id: 6, repo_name: 'wrongsecrets', number: 205, title: 'Remove secret material from example build history', state: 'open', author: 'supply-chain-scout', html_url: '#', participants: 5, consensus_accept: 2, consensus_modify: 2, consensus_reject: 1, merged_upstream: 0, created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-08T15:20:00Z' },
]

const demoRepos: DashboardRepo[] = [
  { id: 1, name: 'juice-shop', language: 'TypeScript', total_prs: 3, total_accept: 26, total_modify: 5, total_reject: 2, total_duplicate: 0 },
  { id: 2, name: 'webgoat', language: 'Java', total_prs: 2, total_accept: 16, total_modify: 4, total_reject: 1, total_duplicate: 0 },
  { id: 3, name: 'crapi', language: 'Python', total_prs: 2, total_accept: 14, total_modify: 3, total_reject: 2, total_duplicate: 0 },
  { id: 4, name: 'nodegoat', language: 'JavaScript', total_prs: 2, total_accept: 10, total_modify: 3, total_reject: 1, total_duplicate: 0 },
  { id: 5, name: 'pysap', language: 'Python', total_prs: 2, total_accept: 29, total_modify: 3, total_reject: 1, total_duplicate: 0 },
  { id: 6, name: 'wrongsecrets', language: 'Java', total_prs: 1, total_accept: 2, total_modify: 2, total_reject: 1, total_duplicate: 0 },
]

const demoContributors: DashboardContributor[] = [
  { login: 'alice-validator', prs_worked: 9, total_interactions: 24, accepts: 17, modified_reputation: 48.6 },
  { login: 'casey-maintainer', prs_worked: 8, total_interactions: 21, accepts: 15, modified_reputation: 41.2 },
  { login: 'bob-reviewer', prs_worked: 7, total_interactions: 18, accepts: 10, modified_reputation: 34.8 },
  { login: 'devon-analyst', prs_worked: 6, total_interactions: 16, accepts: 9, modified_reputation: 29.4 },
  { login: 'riley-appsec', prs_worked: 5, total_interactions: 13, accepts: 8, modified_reputation: 24.1 },
  ...Array.from({ length: 29 }, (_, index) => ({ login: `community-validator-${index + 6}`, prs_worked: Math.max(1, 5 - Math.floor(index / 6)), total_interactions: Math.max(2, 12 - index), accepts: Math.max(1, 7 - Math.floor(index / 5)), modified_reputation: Math.max(3, 22 - index * .65) })),
]

function getStatus(pr: DashboardPR): DashboardStatus {
  if (pr.merged_upstream) return 'Upstream accepted'
  if (pr.state === 'closed') return 'Closed'
  const total = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject
  const acceptRate = total ? pr.consensus_accept / total : 0
  if (pr.participants >= 10 && acceptRate >= 0.75) return 'Community trusted'
  return 'Awaiting review'
}

function formatDate(date: string | null) {
  if (!date) return 'Not yet synced'
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date))
}

function number(value: unknown) {
  return Number(value) || 0
}

function LineChart({ prs, range }: { prs: DashboardPR[]; range: number }) {
  const points = useMemo(() => {
    const dates = prs.map(pr => new Date(pr.created_at)).filter(date => !Number.isNaN(date.getTime())).sort((a, b) => a.getTime() - b.getTime())
    if (!dates.length) return []
    const end = Math.max(...dates.map(date => date.getTime()))
    const start = range === 0 ? Math.min(...dates.map(date => date.getTime())) : end - range * 86_400_000
    const visible = dates.filter(date => date.getTime() >= start)
    const buckets = 12
    const span = Math.max(end - start, 86_400_000)
    return Array.from({ length: buckets }, (_, index) => {
      const boundary = start + (span * index) / (buckets - 1)
      return {
        value: visible.filter(date => date.getTime() <= boundary).length,
        date: new Date(boundary),
      }
    })
  }, [prs, range])

  if (!points.length) return <div className="dashboard-empty">No activity in this period.</div>
  const max = Math.max(...points.map(point => point.value), 1)
  const chartPoints = points.map((point, index) => ({
    ...point,
    x: 18 + index * (464 / (points.length - 1)),
    y: 164 - (point.value / max) * 132,
  }))
  const coords = chartPoints.map(point => `${point.x},${point.y}`).join(' ')
  const area = `18,164 ${coords} 482,164`

  return (
    <div className="line-chart" role="group" aria-label={`Cumulative candidate fixes, ending at ${points[points.length - 1]?.value ?? 0}`}>
      <div className="line-chart-plot">
        <svg viewBox="0 0 500 190" preserveAspectRatio="none" aria-hidden="true">
          {[32, 76, 120, 164].map(y => <line key={y} x1="18" y1={y} x2="482" y2={y} className="chart-grid" />)}
          <polygon points={area} className="chart-area" />
          <polyline points={coords} className="chart-line" />
          {chartPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="3.4" className="chart-point" />)}
        </svg>
        {chartPoints.map((point, index) => {
          const dateLabel = point.date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
          return (
            <button className="chart-hotspot" key={index} style={{ left: `${point.x / 5}%`, top: `${point.y / 1.9}%` }} aria-label={`${dateLabel}: ${point.value} cumulative candidate fixes`}>
              <span className="chart-tooltip" aria-hidden="true"><strong>{dateLabel}</strong><small>{point.value} cumulative candidate {point.value === 1 ? 'fix' : 'fixes'}</small></span>
            </button>
          )
        })}
      </div>
      <div className="chart-axis"><span>Start</span><span>{points[points.length - 1]?.value ?? 0} candidate fixes</span></div>
    </div>
  )
}

function DecisionDonut({ accept, modify, reject, duplicate }: { accept: number; modify: number; reject: number; duplicate: number }) {
  const total = Math.max(accept + modify + reject + duplicate, 1)
  const values = [accept, modify, reject, duplicate]
  const colors = ['#4cd964', '#55a7ff', '#ff7a7a', '#9b85ff']
  let offset = 0
  const stops = values.flatMap((value, index) => {
    const start = offset
    offset += value / total * 100
    return [`${colors[index]} ${start}%`, `${colors[index]} ${offset}%`]
  }).join(', ')
  return (
    <div className="donut-wrap">
      <div className="decision-donut" style={{ background: `conic-gradient(${stops})` }} role="img" aria-label={`${total} community decisions`}>
        <div><strong>{total}</strong><span>decisions</span></div>
      </div>
      <ul className="donut-legend">
        {[
          ['Accept', accept, '#4cd964'],
          ['Modify', modify, '#55a7ff'],
          ['Reject', reject, '#ff7a7a'],
          ['Duplicate', duplicate, '#9b85ff'],
        ].map(([label, value, color]) => (
          <li key={String(label)}><span className="legend-dot" style={{ background: String(color) }} /><span>{label}</span><strong>{value}</strong></li>
        ))}
      </ul>
    </div>
  )
}

export default function Dashboard() {
  const [prs, setPRs] = useState<DashboardPR[]>(demoPRs)
  const [repos, setRepos] = useState<DashboardRepo[]>(demoRepos)
  const [contributors, setContributors] = useState<DashboardContributor[]>(demoContributors)
  const [lastSynced, setLastSynced] = useState<string | null>(SNAPSHOT_DATE)
  const [usingDemo, setUsingDemo] = useState(true)
  const [range, setRange] = useState(90)
  const [activityRepo, setActivityRepo] = useState('all')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | DashboardStatus>('All')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/leaderboard/prs').then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/leaderboard/repos').then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/leaderboard/contributors').then(r => r.ok ? r.json() : Promise.reject()),
      fetch('/api/leaderboard/meta').then(r => r.ok ? r.json() : Promise.reject()),
    ]).then(([prData, repoData, contributorData, meta]) => {
      if (cancelled || !Array.isArray(prData) || !Array.isArray(repoData) || prData.length === 0) return
      setPRs(prData.map((pr: DashboardPR) => ({ ...pr, consensus_duplicate: number(pr.consensus_duplicate) })))
      setRepos(repoData)
      setContributors(Array.isArray(contributorData) ? contributorData : [])
      setLastSynced(meta?.last_synced_at ?? null)
      setUsingDemo(false)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const metrics = useMemo(() => {
    const statuses = prs.map(getStatus)
    return {
      candidate: prs.length,
      awaiting: statuses.filter(status => status === 'Awaiting review').length,
      trusted: statuses.filter(status => status === 'Community trusted').length,
      accepted: statuses.filter(status => status === 'Upstream accepted').length,
      projects: new Set(prs.map(pr => pr.repo_id)).size || repos.length,
      acceptVotes: prs.reduce((sum, pr) => sum + number(pr.consensus_accept), 0),
      modifyVotes: prs.reduce((sum, pr) => sum + number(pr.consensus_modify), 0),
      rejectVotes: prs.reduce((sum, pr) => sum + number(pr.consensus_reject), 0),
      duplicateVotes: prs.reduce((sum, pr) => sum + number(pr.consensus_duplicate), 0),
    }
  }, [prs, repos.length])

  const projectRows = useMemo(() => {
    return repos.map(repo => {
      const repoPRs = prs.filter(pr => pr.repo_id === repo.id || pr.repo_name === repo.name)
      const accepted = repoPRs.filter(pr => getStatus(pr) === 'Upstream accepted').length
      const trusted = repoPRs.filter(pr => getStatus(pr) === 'Community trusted').length
      const review = repoPRs.filter(pr => getStatus(pr) === 'Awaiting review').length
      return { ...repo, accepted, trusted, review, total: repoPRs.length || number(repo.total_prs) }
    }).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [prs, repos])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return prs.filter(pr => {
      const status = getStatus(pr)
      return (statusFilter === 'All' || status === statusFilter) && (!normalized || `${pr.repo_name} ${pr.title} ${pr.number}`.toLowerCase().includes(normalized))
    }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }, [prs, query, statusFilter])

  const pageSize = 6
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visiblePRs = filtered.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => setPage(1), [query, statusFilter])

  const activityPRs = useMemo(() => {
    if (activityRepo === 'all') return prs
    return prs.filter(pr => String(pr.repo_id) === activityRepo)
  }, [activityRepo, prs])

  const activityDays = useMemo(() => {
    const latest = Math.max(...prs.map(pr => new Date(pr.updated_at).getTime()).filter(Number.isFinite))
    const end = new Date(latest || new Date(SNAPSHOT_DATE).getTime())
    end.setUTCHours(0, 0, 0, 0)
    end.setUTCDate(end.getUTCDate() + (7 - (end.getUTCDay() || 7)))
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - 83)

    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + index)
      const key = date.toISOString().slice(0, 10)
      const touched = activityPRs.filter(pr => pr.updated_at.slice(0, 10) === key)
      const decisions = touched.reduce((sum, pr) => sum + number(pr.consensus_accept) + number(pr.consensus_modify) + number(pr.consensus_reject) + number(pr.consensus_duplicate), 0)
      return { date, key, fixes: touched.length, decisions }
    })
  }, [activityPRs, prs])

  const activityMonths = useMemo(() => Array.from({ length: 12 }, (_, week) => {
    const date = activityDays[week * 7]?.date
    const previous = week > 0 ? activityDays[(week - 1) * 7]?.date : null
    if (!date || (previous && date.getUTCMonth() === previous.getUTCMonth())) return ''
    return date.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' })
  }), [activityDays])

  return (
    <div className="oasis-dashboard">
      <section className="dashboard-hero">
        <div className="dashboard-shell">
          <div className="dashboard-hero-meta">
            <span className="dashboard-kicker">OASIS // Community security signal</span>
            <span>Last updated · {formatDate(lastSynced)}</span>
          </div>
          <div className="dashboard-hero-body">
            <div>
              <h1>OWASP OASIS<br /><span>Status Dashboard</span></h1>
              <p>Automated fixes found, human judgment applied, and trusted security improvements moved upstream.</p>
            </div>
          </div>
          <div className="dashboard-data-note"><span className={usingDemo ? 'is-demo' : 'is-live'} />{usingDemo ? 'Snapshot' : 'Live workspace data'}</div>
        </div>
      </section>

      <section className="dashboard-metrics" aria-label="OASIS at a glance">
        <div className="dashboard-shell metric-grid">
          {[
            ['Active projects', metrics.projects, `${contributors.length} validators`],
            ['Candidate fixes', metrics.candidate, 'Generated for review'],
            ['Community trusted', metrics.trusted, 'Reached trust threshold'],
            ['Upstream accepted', metrics.accepted, 'Merged by maintainers'],
          ].map(([label, value, detail], index) => (
            <article className={`metric-card metric-card--${index + 1}`} key={String(label)}>
              <span>{label}</span><strong>{value}</strong><small>{detail}</small>
            </article>
          ))}
        </div>
      </section>

      <main className="dashboard-shell dashboard-content">
        <div className="dashboard-grid dashboard-grid--wide">
          <section className="dashboard-panel dashboard-panel--trend">
            <div className="panel-heading">
              <div><span className="panel-index">01</span><h2>Candidate fixes over time</h2></div>
              <div className="range-control" aria-label="Chart range">
                {[30, 90, 0].map(days => <button key={days} className={range === days ? 'active' : ''} onClick={() => setRange(days)}>{days || 'All'}{days ? 'd' : ''}</button>)}
              </div>
            </div>
            <LineChart prs={prs} range={range} />
          </section>

          <section className="dashboard-panel dashboard-panel--pipeline">
            <div className="panel-heading"><div><span className="panel-index">02</span><h2>Validation pipeline</h2></div></div>
            <div className="pipeline">
              {[
                ['Candidate fixes', metrics.candidate, '#55a7ff'],
                ['Awaiting review', metrics.awaiting, '#ffcc55'],
                ['Community trusted', metrics.trusted, '#9b85ff'],
                ['Upstream accepted', metrics.accepted, '#4cd964'],
              ].map(([label, value, color]) => (
                <div className="pipeline-row" key={String(label)}>
                  <div><span>{label}</span><strong>{value}</strong></div>
                  <div className="pipeline-track"><i style={{ width: `${Math.max((Number(value) / Math.max(metrics.candidate, 1)) * 100, Number(value) ? 4 : 0)}%`, background: String(color) }} /></div>
                </div>
              ))}
            </div>
            <p className="panel-footnote">Trust requires 10+ validators and at least 75% accept votes. Upstream maintainers make the final merge decision.</p>
          </section>
        </div>

        <div className="dashboard-grid dashboard-grid--equal">
          <section className="dashboard-panel">
            <div className="panel-heading"><div><span className="panel-index">03</span><h2>Most active projects</h2></div><Link to="/workspace/projects">All projects ↗</Link></div>
            <div className="project-bars">
              {projectRows.map(project => (
                <div className="project-bar-row" key={project.id}>
                  <div className="project-bar-label"><strong>{project.name}</strong><span>{project.language || '—'}</span></div>
                  <div className="project-bar-track" tabIndex={0} role="img" aria-label={`${project.name}: ${project.accepted} accepted, ${project.trusted} community trusted, ${project.review} awaiting review, ${project.total} total candidate fixes`}>
                    <i className="accepted" style={{ width: `${project.total ? project.accepted / project.total * 100 : 0}%` }} />
                    <i className="trusted" style={{ width: `${project.total ? project.trusted / project.total * 100 : 0}%` }} />
                    <i className="review" style={{ width: `${project.total ? project.review / project.total * 100 : 0}%` }} />
                    <span className="project-tooltip" aria-hidden="true"><strong>{project.name}</strong><small>{project.accepted} accepted · {project.trusted} trusted · {project.review} in review</small></span>
                  </div>
                  <strong className="project-total">{project.total}</strong>
                </div>
              ))}
            </div>
            <div className="mini-legend"><span><i className="accepted" />Accepted</span><span><i className="trusted" />Trusted</span><span><i className="review" />In review</span></div>
          </section>

          <section className="dashboard-panel">
            <div className="panel-heading"><div><span className="panel-index">04</span><h2>Community decisions</h2></div></div>
            <DecisionDonut accept={metrics.acceptVotes} modify={metrics.modifyVotes} reject={metrics.rejectVotes} duplicate={metrics.duplicateVotes} />
          </section>
        </div>

        <section className="dashboard-panel dashboard-leaderboard">
          <div className="panel-heading"><div><span className="panel-index">05</span><h2>Community leaderboard</h2></div><Link to="/workspace/contributors">Full leaderboard ↗</Link></div>
          <div className="leaderboard-list">
            {[...contributors].sort((a, b) => number(b.modified_reputation) - number(a.modified_reputation)).slice(0, 5).map((contributor, index) => (
              <div className="leaderboard-row" key={contributor.login}>
                <span className="leaderboard-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="leaderboard-avatar">{contributor.login.slice(0, 2).toUpperCase()}</span>
                <strong>{contributor.login}</strong>
                <span><b>{number(contributor.prs_worked)}</b> fixes reviewed</span>
                <span><b>{number(contributor.total_interactions)}</b> decisions</span>
                <span className="leaderboard-score"><b>{number(contributor.modified_reputation).toFixed(1)}</b> reputation</span>
              </div>
            ))}
          </div>
        </section>

        <section className="dashboard-panel dashboard-activity">
          <div className="panel-heading">
            <div><span className="panel-index">06</span><h2>Review activity</h2></div>
            <div className="activity-controls">
              <label className="activity-filter"><span>Repo</span><select value={activityRepo} onChange={event => setActivityRepo(event.target.value)} aria-label="Filter review activity by repository"><option value="all">All repositories</option>{repos.map(repo => <option value={String(repo.id)} key={repo.id}>{repo.name}</option>)}</select></label>
              <span className="panel-heading-note">Last 12 weeks</span>
            </div>
          </div>
          <div className="heatmap-months" aria-hidden="true"><span />{activityMonths.map((month, index) => <span key={index}>{month}</span>)}</div>
          <div className="heatmap-wrap">
            <div className="heatmap-days"><span>Mon</span><span>Wed</span><span>Fri</span></div>
            <div className="heatmap" aria-label="Daily community review activity over the last twelve weeks">
              {activityDays.map(day => {
                const level = day.decisions === 0 ? 0 : day.decisions < 4 ? 1 : day.decisions < 8 ? 2 : day.decisions < 13 ? 3 : 4
                const dateLabel = day.date.toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).toUpperCase()
                return (
                  <button className="heatmap-cell" key={day.key} data-level={level} aria-label={`${dateLabel}: ${day.decisions} decisions across ${day.fixes} fixes`}>
                    <span className="heatmap-tooltip" aria-hidden="true"><strong>{dateLabel}</strong><small>{day.decisions} decisions · {day.fixes} {day.fixes === 1 ? 'fix' : 'fixes'} touched</small></span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="heatmap-scale"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} data-level={level} />)}<span>More</span></div>
          <p className="activity-note">Hover or focus a day to see review activity.</p>
        </section>

        <section className="dashboard-panel dashboard-ledger">
          <div className="panel-heading ledger-heading">
            <div><span className="panel-index">07</span><h2>Fix ledger</h2><span className="ledger-count">{filtered.length} records</span></div>
            <div className="ledger-controls">
              <label className="dashboard-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search fixes" aria-label="Search fixes" /></label>
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as 'All' | DashboardStatus)} aria-label="Filter by status">
                <option>All</option><option>Awaiting review</option><option>Community trusted</option><option>Upstream accepted</option><option>Closed</option>
              </select>
            </div>
          </div>
          <div className="ledger-table-wrap">
            <table className="ledger-table">
              <thead><tr><th>Project / fix</th><th>Status</th><th>Signal</th><th>Updated</th></tr></thead>
              <tbody>
                {visiblePRs.map(pr => {
                  const status = getStatus(pr)
                  const repoUrl = pr.html_url.startsWith('http') ? pr.html_url.replace(/\/pull\/\d+.*$/, '') : `https://github.com/OWASP/${pr.repo_name}`
                  return (
                    <tr key={pr.id}>
                      <td><span className="ledger-project-line"><a href={repoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${pr.repo_name} repository on GitHub`}>{pr.repo_name} ↗</a><span>· #{pr.number}</span></span><strong>{pr.title}</strong></td>
                      <td><span className={`dashboard-status status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span></td>
                      <td><div className="signal"><span className="yes" style={{ flex: pr.consensus_accept || 0 }} /><span className="change" style={{ flex: pr.consensus_modify || 0 }} /><span className="no" style={{ flex: pr.consensus_reject || 0 }} /></div><small>{pr.participants} validators</small></td>
                      <td>{formatDate(pr.updated_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!visiblePRs.length && <div className="dashboard-empty">No fixes match this view.</div>}
          </div>
          <div className="ledger-pagination"><span>{(page - 1) * pageSize + (filtered.length ? 1 : 0)}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}</span><div><button disabled={page === 1} onClick={() => setPage(value => value - 1)}>← Prev</button><span>{page} / {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage(value => value + 1)}>Next →</button></div></div>
        </section>
      </main>
    </div>
  )
}
