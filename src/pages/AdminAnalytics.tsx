import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './AdminAnalytics.css'

type Granularity = 'day' | 'week' | 'month'
type MetricRow = Record<string, string | number | null>

interface AnalyticsPayload {
  ok: boolean
  error?: string
  range: {
    from: string
    to: string
    granularity: Granularity
    days: number
    previous_from: string
    previous_to: string
  }
  privacy: {
    minimum_contributors: number
    contributing_voters: number
    engagement_suppressed: boolean
    individual_identifiers_stored: boolean
    individual_identifiers_returned: boolean
  }
  freshness: {
    first_party_date?: string | null
    cloudflare_date?: string | null
    engagement_date?: string | null
  }
  configuration: {
    environment: string
    cloudflare_ready: boolean
    first_party_collection: boolean
    reads_shared_production_data: boolean
    detailed_retention_days: number
  }
  site: {
    current: MetricRow
    previous: MetricRow
    series: MetricRow[]
    routes: MetricRow[]
  }
  cloudflare: {
    current: MetricRow
    previous: MetricRow
    series: MetricRow[]
    source_is_estimated: boolean
  }
  engagement: null | {
    current: MetricRow
    series: MetricRow[]
    projects: MetricRow[]
  }
  collection: {
    counts: MetricRow[]
    days: MetricRow[]
  }
  budgets: MetricRow[]
}

function utcDate(offset: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
    .toISOString().slice(0, 10)
}

function number(row: MetricRow | undefined, key: string): number {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value))
}

function formatBytes(value: number): string {
  if (value < 1024) return `${formatNumber(value)} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

function comparison(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? 'New activity' : 'No prior activity'
  const change = ((current - previous) / previous) * 100
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs prior period`
}

function SummaryCard({ label, value, note, estimated = false }: {
  label: string
  value: string
  note: string
  estimated?: boolean
}) {
  return (
    <article className="analytics-summary-card">
      <span>{label}{estimated && <em>Estimated</em>}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  )
}

function SeriesBars({ rows, metric, label }: { rows: MetricRow[]; metric: string; label: string }) {
  const max = Math.max(1, ...rows.map(row => number(row, metric)))
  return (
    <div className="analytics-bars" aria-label={label}>
      {rows.length === 0 && <p>No complete observations in this range.</p>}
      {rows.map(row => {
        const value = number(row, metric)
        return (
          <div className="analytics-bar-row" key={String(row.bucket)}>
            <time>{String(row.bucket)}</time>
            <div><span style={{ width: `${Math.max(value > 0 ? 2 : 0, value / max * 100)}%` }} /></div>
            <strong>{formatNumber(value)}</strong>
          </div>
        )
      })}
    </div>
  )
}

export default function AdminAnalytics() {
  const { user, loading: authLoading } = useAuth()
  const [from, setFrom] = useState(utcDate(-30))
  const [to, setTo] = useState(utcDate(-1))
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    if (user?.role !== 'admin') return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ from, to, granularity })
      const response = await fetch(`/api/admin/analytics?${params}`, {
        credentials: 'include', cache: 'no-store',
      })
      const data = await response.json() as AnalyticsPayload
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'Could not load analytics.')
      setPayload(data)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load analytics.')
    } finally {
      setLoading(false)
    }
  }, [from, granularity, to, user?.role])

  useEffect(() => { void load() }, [load])

  const collect = useCallback(async () => {
    setCollecting(true)
    setError('')
    setNotice('')
    try {
      const csrfResponse = await fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
      const { token } = await csrfResponse.json() as { token?: string }
      if (!csrfResponse.ok || !token) throw new Error('Could not create a security token.')
      const response = await fetch('/api/admin/analytics/collect', {
        method: 'POST', credentials: 'include', headers: { 'x-csrf-token': token },
      })
      const data = await response.json() as {
        ok?: boolean
        error?: string
        processed_days?: number
        failed_days?: number
        remaining_days?: number
        configuration_required?: boolean
      }
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'Collection failed.')
      if (data.configuration_required) {
        setNotice('Cloudflare collection is waiting for its analytics token and zone ID.')
      } else {
        setNotice(`Collected ${data.processed_days ?? 0} day(s); ${data.failed_days ?? 0} failed and ${data.remaining_days ?? 0} remain queued.`)
      }
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Collection failed.')
    } finally {
      setCollecting(false)
    }
  }, [load])

  const collectionCounts = useMemo(() => new Map(
    (payload?.collection.counts ?? []).map(row => [String(row.status), number(row, 'count')]),
  ), [payload])

  if (authLoading) return <div className="analytics-page container"><p>Checking access…</p></div>
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />

  const siteCurrent = payload?.site.current
  const sitePrevious = payload?.site.previous
  const cfCurrent = payload?.cloudflare.current
  const cfPrevious = payload?.cloudflare.previous
  const pageViews = number(siteCurrent, 'page_views')
  const navigationCount = number(siteCurrent, 'navigation_count')
  const averageLoad = navigationCount > 0 ? number(siteCurrent, 'load_ms_sum') / navigationCount : 0
  const cfRequests = number(cfCurrent, 'requests_estimate')
  const cfErrors = number(cfCurrent, 'response_5xx')
  const cacheTotal = number(cfCurrent, 'cache_hits_estimate') + number(cfCurrent, 'cache_misses_estimate')
  const cacheRate = cacheTotal > 0 ? number(cfCurrent, 'cache_hits_estimate') / cacheTotal * 100 : 0

  return (
    <div className="analytics-page container">
      <header className="analytics-header">
        <div>
          <p className="analytics-eyebrow">Administration</p>
          <h1>Analytics</h1>
          <p>Privacy-safe site, performance, validation-engagement, and operational history.</p>
        </div>
        <nav aria-label="Administration sections">
          <Link to="/admin">User access</Link>
          <Link to="/admin/analytics" aria-current="page">Analytics</Link>
        </nav>
      </header>

      <section className="analytics-controls" aria-label="Analytics range">
        <label>From<input type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>
        <label>To<input type="date" value={to} min={from} max={utcDate(-1)} onChange={event => setTo(event.target.value)} /></label>
        <label>Group by<select value={granularity} onChange={event => setGranularity(event.target.value as Granularity)}>
          <option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
        </select></label>
        <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </section>

      {error && <p className="analytics-message analytics-message--error" role="alert">{error}</p>}
      {notice && <p className="analytics-message analytics-message--success" role="status">{notice}</p>}
      {!payload && !error && <p className="analytics-state">Loading analytics…</p>}

      {payload && <>
        <section className="analytics-freshness" aria-label="Data freshness">
          <span>First-party through <strong>{payload.freshness.first_party_date ?? 'not collected'}</strong></span>
          <span>Cloudflare through <strong>{payload.freshness.cloudflare_date ?? 'not collected'}</strong></span>
          <span>Engagement through <strong>{payload.freshness.engagement_date ?? 'not collected'}</strong></span>
          <span>Detailed retention <strong>{payload.configuration.detailed_retention_days} days</strong></span>
        </section>

        <section>
          <h2>Site usage and performance</h2>
          <div className="analytics-summary-grid">
            <SummaryCard label="Page views" value={formatNumber(pageViews)} note={comparison(pageViews, number(sitePrevious, 'page_views'))} />
            <SummaryCard label="Average page load" value={navigationCount ? `${Math.round(averageLoad)} ms` : '—'} note={`${formatNumber(navigationCount)} measured navigations`} />
            <SummaryCard label="Cloudflare requests" value={formatNumber(cfRequests)} note={comparison(cfRequests, number(cfPrevious, 'requests_estimate'))} estimated />
            <SummaryCard label="Cloudflare visits" value={formatNumber(number(cfCurrent, 'visits_estimate'))} note="Cloudflare referral-based visit estimate" estimated />
            <SummaryCard label="5xx error rate" value={cfRequests ? `${(cfErrors / cfRequests * 100).toFixed(2)}%` : '—'} note={`${formatNumber(cfErrors)} estimated server errors`} estimated />
            <SummaryCard label="Cache hit rate" value={cacheTotal ? `${cacheRate.toFixed(1)}%` : '—'} note={formatBytes(number(cfCurrent, 'response_bytes')) + ' transferred'} estimated />
          </div>
          <div className="analytics-two-column">
            <article className="analytics-panel"><h3>First-party page views</h3><SeriesBars rows={payload.site.series} metric="page_views" label="Page views over time" /></article>
            <article className="analytics-panel"><h3>Cloudflare request estimate</h3><SeriesBars rows={payload.cloudflare.series} metric="requests_estimate" label="Cloudflare requests over time" /></article>
          </div>
        </section>

        <section className="analytics-panel">
          <h2>Route usage</h2>
          <p className="analytics-description">Only approved route templates are stored. Query strings and path identifiers are discarded before aggregation.</p>
          <div className="analytics-table" role="table" aria-label="Route usage">
            <div className="analytics-row analytics-row--heading" role="row"><span>Route</span><span>Views</span><span>Avg load</span><span>Max load</span></div>
            {payload.site.routes.map(row => {
              const measured = number(row, 'navigation_count')
              return <div className="analytics-row" role="row" key={String(row.route_key)}>
                <code>{String(row.route_key)}</code><span>{formatNumber(number(row, 'page_views'))}</span>
                <span>{measured ? `${Math.round(number(row, 'load_ms_sum') / measured)} ms` : '—'}</span>
                <span>{measured ? `${formatNumber(number(row, 'load_ms_max'))} ms` : '—'}</span>
              </div>
            })}
          </div>
        </section>

        <section className="analytics-panel">
          <div className="analytics-section-heading">
            <div><h2>Cloudflare archive</h2><p>Closed UTC days, collected in bounded batches of five.</p></div>
            <button type="button" className="btn btn-primary" disabled={collecting} onClick={() => void collect()}>
              {collecting ? 'Collecting…' : 'Collect now'}
            </button>
          </div>
          {payload.configuration.reads_shared_production_data ? (
            <p className="analytics-callout">
              Preview displays analytics from the D1 database shared with production. Preview traffic
              and review activity are not recorded, so testing does not alter production metrics.
              Cloudflare archive credentials are configured and evaluated only by the production Worker.
            </p>
          ) : !payload.configuration.cloudflare_ready && (
            <p className="analytics-callout">
              Cloudflare archive collection needs the <code>CLOUDFLARE_ANALYTICS_TOKEN</code> and{' '}
              <code>CLOUDFLARE_ZONE_ID</code> Worker secrets. First-party page and engagement collection
              is active in this environment.
            </p>
          )}
          <div className="analytics-collection-counts">
            {['pending', 'running', 'succeeded', 'failed'].map(status => <span key={status}><strong>{collectionCounts.get(status) ?? 0}</strong> {status}</span>)}
          </div>
          <details><summary>Collection day history</summary>
            <div className="analytics-table analytics-table--collection" role="table">
              {payload.collection.days.map(row => <div className="analytics-row" role="row" key={String(row.metric_date)}>
                <time>{String(row.metric_date)}</time><span className={`analytics-status analytics-status--${row.status}`}>{String(row.status)}</span>
                <span>{formatNumber(number(row, 'attempts'))} attempt(s)</span><span>{row.error_summary ? String(row.error_summary) : '—'}</span>
              </div>)}
            </div>
          </details>
        </section>

        <section className="analytics-panel">
          <h2>Validation engagement</h2>
          {payload.privacy.engagement_suppressed || !payload.engagement ? (
            <p className="analytics-callout">Hidden until at least {payload.privacy.minimum_contributors} distinct voters contribute in the selected period. Current qualifying voters: {payload.privacy.contributing_voters}. No username or stable user pseudonym is stored in analytics.</p>
          ) : <>
            <div className="analytics-summary-grid">
              <SummaryCard label="Reviews opened" value={formatNumber(number(payload.engagement.current, 'review_opens'))} note="Authenticated review panels" />
              <SummaryCard label="Active review time" value={`${(number(payload.engagement.current, 'active_seconds') / 60).toFixed(1)} min`} note="Hidden and idle tabs excluded" />
              <SummaryCard label="Votes submitted" value={formatNumber(number(payload.engagement.current, 'votes_submitted'))} note="Authoritative successful vote records" />
            </div>
            <div className="analytics-table" role="table" aria-label="Project engagement">
              <div className="analytics-row analytics-row--heading" role="row"><span>Project</span><span>Contributors</span><span>Reviews</span><span>Active minutes</span></div>
              {payload.engagement.projects.map(row => <div className="analytics-row" role="row" key={String(row.repo_id)}>
                <span>{String(row.project)}</span><span>{formatNumber(number(row, 'contributors'))}</span>
                <span>{formatNumber(number(row, 'review_opens'))}</span><span>{(number(row, 'active_seconds') / 60).toFixed(1)}</span>
              </div>)}
            </div>
          </>}
        </section>

        <section className="analytics-panel">
          <h2>Operational budgets</h2>
          <p className="analytics-description">The same API, Workflow, and D1 observations retained by the synchronization status system.</p>
          <div className="analytics-table analytics-table--budgets" role="table">
            {payload.budgets.map((row, index) => <div className="analytics-row" role="row" key={`${row.budget_date}-${row.budget_key}-${index}`}>
              <time>{String(row.budget_date)}</time><span>{String(row.label)}</span>
              <span>{formatNumber(number(row, 'consumed'))} {String(row.unit)}</span><span>Limit {row.configured_limit ?? 'observed'}</span>
            </div>)}
          </div>
        </section>
      </>}
    </div>
  )
}
