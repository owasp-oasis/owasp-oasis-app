import { useCallback, useEffect, useState } from 'react'

interface WorkflowDecision {
  decision: 'changes_requested' | 'accepted' | 'declined'
  reason: string
  github_login: string
  created_at: string
}

interface WorkflowSubmission {
  upstream_full_name: string
  upstream_pr_number: number | null
  upstream_pr_url: string | null
  head_repo_full_name: string
  head_branch: string
  validated_head_sha: string
  status: 'pending' | 'open' | 'changes_requested' | 'merged' | 'closed' | 'failed'
  close_reason: string | null
  close_reason_text: string | null
  last_reviewed_by: string | null
  last_reviewed_at: string | null
  submitted_by_login: string
  submitted_at: string | null
  error_summary: string | null
}

interface WorkflowState {
  status: string
  community_ready: boolean
  maintainer_decision: WorkflowDecision | null
  upstream_submission: WorkflowSubmission | null
}

interface Props {
  prId: number
  isAdmin: boolean
}

const DECISION_LABELS = {
  changes_requested: 'Changes requested',
  accepted: 'Maintainer accepted',
  declined: 'Maintainer declined',
} as const

function formatDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '—'
}

export default function WorkflowTab({ prId, isAdmin }: Props) {
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/pr-panel/${prId}/workflow`, { credentials: 'include', cache: 'no-store' })
      const data = await response.json() as { ok: boolean; error?: string } & Partial<WorkflowState>
      if (!response.ok || !data.ok) throw new Error(data.error ?? 'Could not load workflow status')
      setWorkflow({
        status: data.status ?? 'Needs Review',
        community_ready: data.community_ready ?? false,
        maintainer_decision: data.maintainer_decision ?? null,
        upstream_submission: data.upstream_submission ?? null,
      })
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setLoading(false)
    }
  }, [prId])

  useEffect(() => { load() }, [load])

  async function post(path: string, body: Record<string, unknown>) {
    const csrfResponse = await fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
    const csrf = await csrfResponse.json() as { token?: string }
    if (!csrfResponse.ok || !csrf.token) throw new Error('Could not obtain a security token')
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token },
      body: JSON.stringify(body),
    })
    const data = await response.json() as { ok: boolean; error?: string } & Partial<WorkflowState>
    if (!response.ok || !data.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
    setWorkflow({
      status: data.status ?? 'Needs Review',
      community_ready: data.community_ready ?? false,
      maintainer_decision: data.maintainer_decision ?? null,
      upstream_submission: data.upstream_submission ?? null,
    })
  }

  async function submitDecision(decision: WorkflowDecision['decision']) {
    if (!reason.trim()) { setError('Add a short reason so the contributor knows what happens next.'); return }
    setWorking(true)
    setError(null)
    try {
      await post(`/api/pr-panel/${prId}/maintainer-decision`, { decision, reason: reason.trim() })
      setReason('')
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function submitUpstream() {
    if (!window.confirm('Create a separate pull request in the configured upstream repository?')) return
    setWorking(true)
    setError(null)
    try {
      await post(`/api/pr-panel/${prId}/submit-upstream`, { confirm: true })
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setWorking(false)
    }
  }

  if (loading) return <div className="prp-loading">Loading workflow…</div>
  if (error && !workflow) return <div className="prp-error">{error}</div>
  if (!workflow) return null

  const decision = workflow.maintainer_decision
  const submission = workflow.upstream_submission
  const canSubmit = isAdmin && decision?.decision === 'accepted' &&
    (!submission || submission.status === 'failed' || submission.status === 'closed')

  return (
    <div className="prp-workflow">
      <div className="prp-workflow-hero">
        <span className="prp-workflow-kicker">PR workflow</span>
        <strong>{workflow.status}</strong>
        <p>Validator votes stay separate. This status records maintainer disposition and any distinct upstream pull request.</p>
      </div>

      <section className="prp-workflow-section">
        <h3>Maintainer decision</h3>
        {decision ? (
          <div className="prp-workflow-record">
            <strong>{DECISION_LABELS[decision.decision]}</strong>
            <span>{decision.github_login} · {formatDate(decision.created_at)}</span>
            <p>{decision.reason}</p>
          </div>
        ) : (
          <p className="prp-no-data">No maintainer decision recorded. {workflow.community_ready ? 'This candidate is ready for maintainer review.' : 'Community review is still in progress.'}</p>
        )}
      </section>

      <section className="prp-workflow-section">
        <h3>Upstream submission</h3>
        {submission ? (
          <div className="prp-workflow-record">
            <strong>{submission.status === 'changes_requested' ? 'Upstream changes requested' : submission.status === 'merged' ? 'Merged upstream' : submission.status === 'closed' ? 'Closed without merge' : submission.status === 'failed' ? 'Submission failed' : 'Submitted upstream'}</strong>
            <span>{submission.upstream_full_name} · {submission.upstream_pr_number ? `#${submission.upstream_pr_number}` : 'pending'}</span>
            {submission.upstream_pr_url && <a href={submission.upstream_pr_url} target="_blank" rel="noopener noreferrer">Open upstream PR ↗</a>}
            <span>Source branch: {submission.head_repo_full_name}:{submission.head_branch}</span>
            <span>Validated SHA: <code>{submission.validated_head_sha.slice(0, 12)}</code></span>
            {submission.last_reviewed_by && <span>Latest upstream review: {submission.last_reviewed_by} · {formatDate(submission.last_reviewed_at)}</span>}
            {submission.error_summary && <p className="prp-workflow-error">{submission.error_summary}</p>}
          </div>
        ) : (
          <p className="prp-no-data">No separate upstream PR has been created.</p>
        )}
      </section>

      {isAdmin && (
        <section className="prp-workflow-section prp-workflow-controls">
          <h3>Maintainer controls <span>Admin-authorized for now</span></h3>
          <label htmlFor="maintainer-reason">Decision reason</label>
          <textarea id="maintainer-reason" value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} placeholder="Explain the decision or the next change needed…" />
          <div className="prp-workflow-actions">
            <button disabled={working} onClick={() => submitDecision('changes_requested')}>Request changes</button>
            <button disabled={working} onClick={() => submitDecision('accepted')}>Accept for upstream</button>
            <button disabled={working} onClick={() => submitDecision('declined')}>Decline candidate</button>
          </div>
          {canSubmit && <button className="prp-workflow-submit" disabled={working} onClick={submitUpstream}>Create upstream PR</button>}
          {error && <p className="prp-workflow-error">{error}</p>}
        </section>
      )}
    </div>
  )
}
