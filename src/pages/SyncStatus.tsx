import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './SyncStatus.css'

type OverallStatus = 'healthy' | 'running' | 'degraded' | 'stale' | 'unknown'
type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'deferred' | 'interrupted'

interface PublicRun {
  id: string
  pipeline_run_id: string | null
  workflow_instance_id: string | null
  job_key: string
  label: string
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
  retryable: boolean
  latest_run: PublicRun | null
  recent_runs: PublicRun[]
}

interface SyncStatusPayload {
  generated_at: string
  observability_ready: boolean
  overall: {
    status: OverallStatus
    sync_running: boolean
    last_success_at: string | null
    last_attempt_at: string | null
    stale_after_hours: number
  }
  canonical: {
    schedule_enabled: boolean
    pipeline_run_id: string | null
    phase: string
    updated_at: string | null
    lock: null | {
      pipeline_run_id: string
      acquired_at: string
      lease_expires_at: string
    }
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
    budget_date?: string
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
  budget_history: Array<{
    budget_date: string
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
  incomplete_runs: PublicRun[]
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

const WORKSPACE_PIPELINE_JOB_KEYS = [
  'repository_inventory',
  'pull_request_catalog',
  'upstream_merge_status',
  'pull_request_comments',
  'comment_reactions',
  'vote_projection',
  'duplicate_resolution',
  'contributor_scores',
  'orphan_cleanup',
] as const

const WORKSPACE_PIPELINES = [
  {
    key: 'legacy',
    title: 'Legacy Workspace runs',
    description: 'The current production writer while the canonical schedule remains behind its cutover gate.',
    parentJobKey: 'legacy_workspace_sync',
    mode: 'legacy',
  },
  {
    key: 'canonical',
    title: 'Canonical Workspace runs',
    description: 'The bounded replacement writer used for canaries and, after cutover, the production schedule.',
    parentJobKey: 'canonical_workspace_sync',
    mode: 'live',
  },
  {
    key: 'shadow',
    title: 'Shadow validation runs',
    description: 'The read-only preview pipeline that compares its projections with canonical Workspace data.',
    parentJobKey: 'shadow_sync_dispatch',
    mode: 'shadow',
  },
] as const satisfies ReadonlyArray<{
  key: string
  title: string
  description: string
  parentJobKey: string
  mode: PublicRun['mode']
}>

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

function scopeJobToMode(job: PublicJob, mode: PublicRun['mode']): PublicJob {
  const recentRuns = job.recent_runs.filter(run => run.mode === mode)
  const latestRun = recentRuns[0] ?? null
  return {
    ...job,
    status: latestRun?.status ?? 'unknown',
    latest_run: latestRun,
    recent_runs: recentRuns,
  }
}

const RETRYABLE_STATUSES: readonly string[] = ['failed', 'skipped', 'deferred', 'interrupted']
const STATUS_RETURN_VIEW_KEY = 'oasis.sync-status.return-view'

interface StatusReturnView {
  expandedSections: string[]
  scrollY: number
}

function readStatusReturnView(): StatusReturnView | null {
  try {
    const raw = window.sessionStorage.getItem(STATUS_RETURN_VIEW_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StatusReturnView>
    if (!Array.isArray(parsed.expandedSections) || typeof parsed.scrollY !== 'number') return null
    return {
      expandedSections: parsed.expandedSections.filter(value => typeof value === 'string'),
      scrollY: Math.max(0, parsed.scrollY),
    }
  } catch {
    return null
  }
}

function writeStatusReturnView(view: StatusReturnView): void {
  try {
    window.sessionStorage.setItem(STATUS_RETURN_VIEW_KEY, JSON.stringify(view))
  } catch { /* Returning still works; only view restoration is unavailable. */ }
}

function clearStatusReturnView(): void {
  try {
    window.sessionStorage.removeItem(STATUS_RETURN_VIEW_KEY)
  } catch { /* Storage can be unavailable in privacy-restricted browsers. */ }
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
  const { user } = useAuth()
  const returnView = useRef<StatusReturnView | null>(readStatusReturnView())
  const [payload, setPayload] = useState<SyncStatusPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [retryingJob, setRetryingJob] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(returnView.current?.expandedSections ?? []),
  )

  const setSectionExpanded = useCallback((section: string, expanded: boolean) => {
    setExpandedSections(current => {
      const next = new Set(current)
      if (expanded) next.add(section)
      else next.delete(section)
      return next
    })
  }, [])

  const rememberStatusView = useCallback(() => {
    writeStatusReturnView({
      expandedSections: Array.from(expandedSections),
      scrollY: window.scrollY,
    })
  }, [expandedSections])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const response = await fetch(`/api/sync/status?refresh=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`Status API returned ${response.status}`)
      setPayload(await response.json() as SyncStatusPayload)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load synchronization status')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const runJob = useCallback(async (job: PublicJob, pipeline: string) => {
    const actionKey = `${pipeline}:${job.key}`
    setRetryingJob(actionKey)
    setActionMessage(null)
    try {
      const csrfResponse = await fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
      if (!csrfResponse.ok) throw new Error('Unable to obtain a security token')
      const { token } = await csrfResponse.json() as { token: string }
      const response = await fetch(`/api/admin/sync/jobs/${encodeURIComponent(job.key)}/retry`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ pipeline }),
      })
      const result = await response.json() as { error?: string; retry_run_id?: string }
      if (!response.ok) throw new Error(result.error ?? `Retry request returned ${response.status}`)
      setActionMessage({
        kind: 'success',
        text: `${job.label} run accepted${result.retry_run_id ? ` as ${result.retry_run_id}` : ''}.`,
      })
      await refresh()
    } catch (reason) {
      setActionMessage({
        kind: 'error',
        text: reason instanceof Error ? reason.message : 'Unable to run the sync job',
      })
    } finally {
      setRetryingJob(null)
    }
  }, [refresh])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  useLayoutEffect(() => {
    if (!payload || !returnView.current) return
    const savedScrollY = returnView.current.scrollY
    const root = document.documentElement
    const priorScrollBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'
    let secondFrame: number | null = null
    const firstFrame = window.requestAnimationFrame(() => {
      window.scrollTo(0, savedScrollY)
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo(0, savedScrollY)
        root.style.scrollBehavior = priorScrollBehavior
        clearStatusReturnView()
        returnView.current = null
      })
    })
    return () => {
      window.cancelAnimationFrame(firstFrame)
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame)
      root.style.scrollBehavior = priorScrollBehavior
    }
  }, [payload])

  const groups = useMemo(() => {
    const jobs = payload?.jobs ?? []
    const byKey = new Map(jobs.map(job => [job.key, job]))
    return {
      pipelines: WORKSPACE_PIPELINES.map(pipeline => {
        const parent = byKey.get(pipeline.parentJobKey)
        return {
          ...pipeline,
          parent: parent ? scopeJobToMode(parent, pipeline.mode) : null,
          jobs: WORKSPACE_PIPELINE_JOB_KEYS.flatMap(jobKey => {
            const job = byKey.get(jobKey)
            return job ? [scopeJobToMode(job, pipeline.mode)] : []
          }),
        }
      }),
      integration: jobs.filter(job => job.category !== 'workspace' && job.key !== 'cloudflare_analytics'),
    }
  }, [payload])

  const renderJob = (job: PublicJob, stateKey: string, pipeline: string) => {
    const actionKey = `${pipeline}:${job.key}`
    return (
    <details
      className="sync-job-card"
      key={job.key}
      open={expandedSections.has(stateKey)}
      onToggle={event => setSectionExpanded(stateKey, event.currentTarget.open)}
    >
      <summary>
        <span><strong>{job.label}</strong><small>{job.schedule}</small></span>
        <StatusPill status={job.status} />
      </summary>
      <div className="sync-job-body">
        {job.latest_run ? (
          <>
            <div className="sync-job-latest">
              <span>Last started {dateTime(job.latest_run.started_at)}</span>
              <span>Duration {duration(job.latest_run.duration_ms)}</span>
              <span>Mode {job.latest_run.mode}</span>
            </div>
            {job.latest_run.error && <p className="sync-run-error">{job.latest_run.error.code}: {job.latest_run.error.summary}</p>}
            <MetricList metrics={job.latest_run.metrics} />
          </>
        ) : (
          <p className="sync-job-empty">This job has no tracked runs in this pipeline yet.</p>
        )}
        {user?.role === 'admin' && job.retryable && (
          <div className="sync-admin-actions">
            <span>Admin action</span>
            <button
              type="button"
              onClick={() => void runJob(job, pipeline)}
              disabled={retryingJob !== null}
            >
              {retryingJob === actionKey
                ? 'Starting…'
                : job.latest_run && RETRYABLE_STATUSES.includes(job.latest_run.status)
                  ? `Retry ${job.label}`
                  : pipeline === 'shadow'
                    ? 'Run shadow pipeline for this job'
                    : `Run ${job.label}`}
            </button>
          </div>
        )}
        <h3>Recent runs</h3>
        <div className="sync-run-table" role="table" aria-label={`${job.label} recent runs`}>
          {job.recent_runs.length === 0 && <p>No tracked runs in this pipeline yet.</p>}
          {job.recent_runs.map(run => (
            <Link
              key={run.id}
              to={`/workspace/status/runs/${run.id}`}
              className="sync-run-row"
              onClick={rememberStatusView}
            >
              <StatusPill status={run.status} />
              <span>{dateTime(run.started_at)}</span>
              <span>{duration(run.duration_ms)}</span>
              <span>Details →</span>
            </Link>
          ))}
        </div>
      </div>
    </details>
    )
  }

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
        {actionMessage && (
          <div className={actionMessage.kind === 'success' ? 'sync-action-success' : 'sync-error'} role="status">
            {actionMessage.text}
          </div>
        )}
        {!payload && !error && <p>Loading synchronization status…</p>}
        {payload && (
          <>
            {!payload.observability_ready && (
              <p className="sync-schema-warning" role="status">
                Detailed job history is temporarily unavailable while the synchronization schema is being initialized.
              </p>
            )}
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
                <div><dt>Workflow phase</dt><dd>{payload.canonical.phase.replace(/_/g, ' ')}</dd></div>
                <div><dt>Production schedule</dt><dd>{payload.canonical.schedule_enabled ? 'Enabled' : 'Disabled for canary'}</dd></div>
                <div><dt>Pipeline updated</dt><dd>{dateTime(payload.canonical.updated_at)}</dd></div>
                <div><dt>Lease expires</dt><dd>{dateTime(payload.canonical.lock?.lease_expires_at ?? null)}</dd></div>
              </dl>
              {payload.canonical.pipeline_run_id && <code>{payload.canonical.pipeline_run_id}</code>}
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

            <details
              className="sync-history-card"
              open={expandedSections.has('budget-history')}
              onToggle={event => setSectionExpanded('budget-history', event.currentTarget.open)}
            >
              <summary>100-day operation budget history</summary>
              <div className="sync-history-table" role="table" aria-label="Operation budget history">
                <div className="sync-history-row sync-history-row--heading" role="row">
                  <span>Date</span><span>Budget</span><span>Consumed</span><span>Limit</span><span>Deferred</span>
                </div>
                {payload.budget_history.length === 0 && <p>No historical budget observations have been recorded.</p>}
                {payload.budget_history.map(budget => (
                  <div className="sync-history-row" role="row" key={`${budget.budget_date}-${budget.budget_key}`}>
                    <time>{budget.budget_date}</time>
                    <span>{budget.label}</span>
                    <span>{budget.consumed} {budget.unit}</span>
                    <span>{budget.configured_limit ?? 'Observed only'}</span>
                    <span>{budget.deferred}</span>
                  </div>
                ))}
              </div>
            </details>

            <details
              className="sync-history-card"
              open={expandedSections.has('incomplete-runs')}
              onToggle={event => setSectionExpanded('incomplete-runs', event.currentTarget.open)}
            >
              <summary>Incomplete run archive ({payload.incomplete_runs.length})</summary>
              <p className="sync-history-description">The newest 100 incomplete jobs remain directly inspectable beyond each job's ten-run summary.</p>
              <div className="sync-run-table" role="table" aria-label="Incomplete sync runs">
                {payload.incomplete_runs.length === 0 && <p>No incomplete runs have been recorded.</p>}
                {payload.incomplete_runs.map(run => (
                  <Link
                    key={run.id}
                    to={`/workspace/status/runs/${run.id}`}
                    className="sync-run-row sync-run-row--archive"
                    onClick={rememberStatusView}
                  >
                    <StatusPill status={run.status} />
                    <span className="sync-run-identity"><strong>{run.label}</strong><small>{run.mode} mode</small></span>
                    <span>{dateTime(run.started_at)}</span>
                    <span>Details →</span>
                  </Link>
                ))}
              </div>
            </details>

            <section>
              <h2 className="sync-section-title">Workspace synchronization pipelines</h2>
              <p className="sync-section-description">Expand a run type to inspect only the jobs and history produced by that pipeline.</p>
              <div className="sync-pipeline-list">
                {groups.pipelines.map(pipeline => (
                  <details
                    className={`sync-pipeline-card sync-pipeline-card--${pipeline.key}`}
                    key={pipeline.key}
                    open={expandedSections.has(`pipeline:${pipeline.key}`)}
                    onToggle={event => setSectionExpanded(`pipeline:${pipeline.key}`, event.currentTarget.open)}
                  >
                    <summary>
                      <span>
                        <strong>{pipeline.title}</strong>
                        <small>{pipeline.description}</small>
                      </span>
                      <StatusPill status={pipeline.parent?.status ?? 'unknown'} />
                    </summary>
                    <div className="sync-pipeline-body">
                      {pipeline.parent?.latest_run ? (
                        <div className="sync-pipeline-overview">
                          <span>Latest parent run</span>
                          <Link
                            to={`/workspace/status/runs/${pipeline.parent.latest_run.id}`}
                            onClick={rememberStatusView}
                          >
                            {dateTime(pipeline.parent.latest_run.started_at)} · View run →
                          </Link>
                        </div>
                      ) : (
                        <p className="sync-job-empty">This pipeline has no tracked parent runs yet.</p>
                      )}
                      {user?.role === 'admin' && pipeline.parent?.retryable && (
                        <div className="sync-admin-actions">
                          <span>Admin pipeline action</span>
                          <button
                            type="button"
                            onClick={() => void runJob(pipeline.parent!, pipeline.key)}
                            disabled={retryingJob !== null}
                          >
                            {retryingJob === `${pipeline.key}:${pipeline.parent.key}`
                              ? 'Starting…'
                              : `Run ${pipeline.title}`}
                          </button>
                        </div>
                      )}
                      <h3>Jobs in this pipeline</h3>
                      <div className="sync-pipeline-jobs">
                        {pipeline.jobs.map(job => renderJob(
                          job,
                          `pipeline:${pipeline.key}:job:${job.key}`,
                          pipeline.key,
                        ))}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            <section>
              <h2 className="sync-section-title">Integrations</h2>
              <div className="sync-job-list">
                {groups.integration.map(job => renderJob(job, `integration:${job.key}`, 'integration'))}
              </div>
              <p className="sync-planned-note">Cloudflare analytics archiving remains a planned dashboard capability and is not presented as an executable job.</p>
            </section>
          </>
        )}
      </div></section>
    </div>
  )
}
