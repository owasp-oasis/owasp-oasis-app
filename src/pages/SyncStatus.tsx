import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './SyncStatus.css'

type OverallStatus = 'healthy' | 'running' | 'degraded' | 'stale' | 'unknown'
type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'deferred' | 'interrupted'

interface PublicRun {
  id: string
  pipeline_run_id: string | null
  workflow_instance_id: string | null
  status: RunStatus
  mode: 'legacy' | 'shadow' | 'live'
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  progress: { expected: number; completed: number; failed: number }
  metrics: Record<string, number | boolean | null>
  error: { code: string | null; summary: string | null } | null
}

interface PublicJob {
  key: string
  label: string
  category: 'workspace' | 'integration' | 'analytics'
  schedule: string
  status: RunStatus | 'unknown'
  latest_run: PublicRun | null
  recent_runs: PublicRun[]
}

interface SyncStatusPayload {
  generated_at: string
  overall: {
    status: OverallStatus
    sync_running: boolean
    last_success_at: string | null
    last_attempt_at: string | null
    stale_after_hours: number
  }
  shadow: null | {
    status: string
    matched_entities: number
    comparable_entities: number
    changed_during_run: number
    difference_count: number
    consecutive_matches: number
    required_consecutive_matches: number
    eligible_for_cutover: boolean
    compared_at: string | null
  }
  budgets: Array<{
    budget_key: string
    label: string
    unit: string
    configured_limit: number | null
    consumed: number
    reserved: number
    deferred: number
    remaining: number | null
    reset_at: string | null
  }>
  jobs: PublicJob[]
}

interface RunDetailPayload {
  run: PublicRun & { label: string; job_key: string }
  events: Array<{
    type: string
    entity_type: string | null
    entity_id: string | null
    attempt: number | null
    response_status: number | null
    message: string | null
    details: Record<string, number | boolean | null>
    created_at: string
  }>
}

function dateTime(value: string | null): string {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'long' }).format(new Date(value))
}

function duration(value: number | null): string {
  if (value === null) return '—'
  if (value < 1000) return `${value} ms`
  const seconds = Math.round(value / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function MetricList({ metrics }: { metrics: Record<string, number | boolean | null> }) {
  const entries = Object.entries(metrics)
  if (entries.length === 0) return null
  return (
    <dl className="sync-metrics">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key.replace(/_/g, ' ')}</dt>
          <dd>{value === null ? '—' : String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatusPill({ status }: { status: string }) {
  return <span className={`sync-status-pill sync-status-pill--${status}`}>{status}</span>
}

export function SyncRunDetail() {
  const { runId = '' } = useParams()
  const [detail, setDetail] = useState<RunDetailPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/sync/status/runs/${encodeURIComponent(runId)}`)
      .then(async response => {
        if (!response.ok) throw new Error(`Unable to load run (${response.status})`)
        return response.json() as Promise<RunDetailPayload>
      })
      .then(setDetail)
      .catch(reason => setError(reason instanceof Error ? reason.message : 'Unable to load run'))
  }, [runId])

  return (
    <div className="sync-status-page">
      <div className="page-hero sync-status-hero">
        <div className="container">
          <div className="workspace-hero__eyebrow">Workspace operations</div>
          <h1>Sync run detail</h1>
          <p>Sanitized execution information retained to make incomplete jobs diagnosable.</p>
        </div>
      </div>
      <section className="section"><div className="container">
        <Link className="sync-back-link" to="/workspace/status">← All sync jobs</Link>
        {error && <div className="sync-error">{error}</div>}
        {!detail && !error && <p>Loading run…</p>}
        {detail && (
          <>
            <article className="sync-summary-card">
              <div><h2>{detail.run.label}</h2><code>{detail.run.id}</code></div>
              <StatusPill status={detail.run.status} />
              <dl className="sync-summary-grid">
                <div><dt>Started</dt><dd>{dateTime(detail.run.started_at)}</dd></div>
                <div><dt>Finished</dt><dd>{dateTime(detail.run.finished_at)}</dd></div>
                <div><dt>Duration</dt><dd>{duration(detail.run.duration_ms)}</dd></div>
                <div><dt>Mode</dt><dd>{detail.run.mode}</dd></div>
              </dl>
              {detail.run.error && <p className="sync-run-error">{detail.run.error.code}: {detail.run.error.summary}</p>}
              <MetricList metrics={detail.run.metrics} />
            </article>
            <h2 className="sync-section-title">Execution events</h2>
            <div className="sync-event-list">
              {detail.events.length === 0 && <p>No granular events were recorded for this run.</p>}
              {detail.events.map((event, index) => (
                <article key={`${event.created_at}-${index}`} className="sync-event">
                  <div><strong>{event.type.replace(/_/g, ' ')}</strong><time>{dateTime(event.created_at)}</time></div>
                  {(event.entity_type || event.entity_id) && <code>{event.entity_type ?? 'entity'} {event.entity_id ?? ''}</code>}
                  {event.message && <p>{event.message}</p>}
                  <MetricList metrics={event.details} />
                </article>
              ))}
            </div>
          </>
        )}
      </div></section>
    </div>
  )
}

export default function SyncStatus() {
  const [payload, setPayload] = useState<SyncStatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await fetch('/api/sync/status')
      if (!response.ok) throw new Error(`Status API returned ${response.status}`)
      setPayload(await response.json() as SyncStatusPayload)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load synchronization status')
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const groups = useMemo(() => ({
    workspace: payload?.jobs.filter(job => job.category === 'workspace') ?? [],
    integration: payload?.jobs.filter(job => job.category !== 'workspace') ?? [],
  }), [payload])

  return (
    <div className="sync-status-page">
      <div className="page-hero sync-status-hero">
        <div className="container">
          <div className="workspace-hero__eyebrow">Workspace operations</div>
          <h1>Synchronization status</h1>
          <p>Freshness, execution history, shadow-system parity, and operational limits for OASIS data jobs.</p>
        </div>
      </div>
      <section className="section"><div className="container">
        <div className="sync-page-actions">
          <Link className="sync-back-link" to="/workspace/pull-requests">← Back to Workspace</Link>
          <button onClick={() => void refresh()} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        {error && <div className="sync-error">{error}. Existing results remain visible while retrying.</div>}
        {!payload && !error && <p>Loading synchronization status…</p>}
        {payload && (
          <>
            <article className="sync-summary-card">
              <div className="sync-summary-heading">
                <div><span className="sync-card-kicker">Canonical Workspace data</span><h2>Workspace sync</h2></div>
                <StatusPill status={payload.overall.status} />
              </div>
              <dl className="sync-summary-grid">
                <div><dt>Last complete success</dt><dd>{dateTime(payload.overall.last_success_at)}</dd></div>
                <div><dt>Last attempt</dt><dd>{dateTime(payload.overall.last_attempt_at)}</dd></div>
                <div><dt>Stale threshold</dt><dd>{payload.overall.stale_after_hours} hours</dd></div>
                <div><dt>Status generated</dt><dd>{dateTime(payload.generated_at)}</dd></div>
              </dl>
            </article>

            <article className="sync-summary-card">
              <div className="sync-summary-heading">
                <div><span className="sync-card-kicker">Read-only replacement validation</span><h2>Shadow Workflow parity</h2></div>
                <StatusPill status={payload.shadow?.status ?? 'unknown'} />
              </div>
              {payload.shadow ? (
                <dl className="sync-summary-grid">
                  <div><dt>Consecutive matches</dt><dd>{payload.shadow.consecutive_matches} / {payload.shadow.required_consecutive_matches}</dd></div>
                  <div><dt>Compared entities</dt><dd>{payload.shadow.comparable_entities}</dd></div>
                  <div><dt>Differences</dt><dd>{payload.shadow.difference_count}</dd></div>
                  <div><dt>Cutover eligibility</dt><dd>{payload.shadow.eligible_for_cutover ? 'Eligible for review' : 'Not eligible'}</dd></div>
                </dl>
              ) : <p>The shadow system has not completed its first comparison.</p>}
            </article>

            <h2 className="sync-section-title">Current operation budgets</h2>
            <div className="sync-budget-grid">
              {payload.budgets.length === 0 && <p>No budget observations have been recorded today.</p>}
              {payload.budgets.map(budget => {
                const percent = budget.configured_limit && budget.configured_limit > 0
                  ? Math.min(100, Math.round((budget.consumed / budget.configured_limit) * 100))
                  : 0
                return (
                  <article className="sync-budget-card" key={budget.budget_key}>
                    <div><strong>{budget.label}</strong><span>{budget.consumed} {budget.unit}</span></div>
                    <div className="sync-budget-track"><span style={{ width: `${percent}%` }} /></div>
                    <small>{budget.configured_limit === null ? 'Observed limit unavailable' : `${budget.remaining ?? Math.max(0, budget.configured_limit - budget.consumed)} remaining of ${budget.configured_limit}`}</small>
                  </article>
                )
              })}
            </div>

            {([['Workspace jobs', groups.workspace], ['Integrations', groups.integration]] as const).map(([title, jobs]) => (
              <section key={title}>
                <h2 className="sync-section-title">{title}</h2>
                <div className="sync-job-list">
                  {jobs.map(job => (
                    <details className="sync-job-card" key={job.key}>
                      <summary>
                        <span><strong>{job.label}</strong><small>{job.schedule}</small></span>
                        <StatusPill status={job.status} />
                      </summary>
                      {job.latest_run && (
                        <div className="sync-job-body">
                          <div className="sync-job-latest">
                            <span>Last started {dateTime(job.latest_run.started_at)}</span>
                            <span>Duration {duration(job.latest_run.duration_ms)}</span>
                            <span>Mode {job.latest_run.mode}</span>
                          </div>
                          {job.latest_run.error && <p className="sync-run-error">{job.latest_run.error.code}: {job.latest_run.error.summary}</p>}
                          <MetricList metrics={job.latest_run.metrics} />
                          <h3>Recent runs</h3>
                          <div className="sync-run-table" role="table" aria-label={`${job.label} recent runs`}>
                            {job.recent_runs.length === 0 && <p>No tracked runs yet.</p>}
                            {job.recent_runs.map(run => (
                              <Link key={run.id} to={`/workspace/status/runs/${run.id}`} className="sync-run-row">
                                <StatusPill status={run.status} />
                                <span>{dateTime(run.started_at)}</span>
                                <span>{duration(run.duration_ms)}</span>
                                <span>Details →</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div></section>
    </div>
  )
}
