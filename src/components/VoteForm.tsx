/**
 * VoteForm — the vote form content without any overlay wrapper.
 * Used inside PRPanel's sticky footer. VoteModal wraps this with an overlay.
 */
import { useState, useEffect, type FormEvent } from 'react'
import './VoteModal.css'

export type Decision = 'accept' | 'modify' | 'reject'

export interface VoteFormPR {
  id: number
  repo_name: string
  number: number
  title: string
}

interface Props {
  pr: VoteFormPR
  initialDecision: Decision
  onClose: () => void
  onSuccess: (decision: Decision) => void
}

const DECISION_LABELS: Record<Decision, string> = {
  accept: 'Accept',
  modify: 'Modify',
  reject: 'Reject',
}

const CONFIDENCE_OPTIONS = ['Low', 'Medium', 'High'] as const

type NextStepSelection = 'Merge' | 'Revise' | 'Re-review' | 'other' | ''

const NEXT_STEP_OPTIONS: { value: NextStepSelection; label: string }[] = [
  { value: 'Merge',     label: 'Merge' },
  { value: 'Revise',    label: 'Revise' },
  { value: 'Re-review', label: 'Re-review' },
  { value: 'other',     label: 'Other' },
]

export default function VoteForm({ pr, initialDecision, onClose, onSuccess }: Props) {
  const [decision, setDecision] = useState<Decision>(initialDecision)
  const [confidence, setConfidence] = useState<string>('Medium')
  const [summary, setSummary] = useState('')
  const [nextStepSelection, setNextStepSelection] = useState<NextStepSelection>('')
  const [nextStepOther, setNextStepOther] = useState('')
  const [blockingIssues, setBlockingIssues] = useState('')
  const [toReconsider, setToReconsider] = useState('')
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync decision when parent changes initialDecision
  useEffect(() => {
    setDecision(initialDecision)
    // Reset fields on decision change so form is clean
    setSummary('')
    setNextStepSelection('')
    setNextStepOther('')
    setBlockingIssues('')
    setToReconsider('')
  }, [initialDecision])

  // Fetch CSRF token on mount
  useEffect(() => {
    fetch('/api/csrf', { credentials: 'include' })
      .then(r => r.json())
      .then((d: unknown) => setCsrfToken((d as { token: string }).token))
      .catch(() => setError('Failed to load security token — please refresh.'))
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!csrfToken) { setError('Missing security token — please refresh.'); return }
    if (decision !== 'reject') {
      if (!nextStepSelection) { setError('Please select a next step.'); return }
      if (nextStepSelection === 'other' && !nextStepOther.trim()) {
        setError('Please describe the next step.'); return
      }
    }
    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = { pr_id: pr.id, decision }
      if (decision === 'reject') {
        body.summary         = summary
        body.blocking_issues = blockingIssues
        body.to_reconsider   = toReconsider
      } else {
        body.confidence = confidence
        body.summary    = summary
        body.next_step  = nextStepSelection === 'other' ? nextStepOther : nextStepSelection
      }

      const res = await fetch('/api/vote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(body),
      })

      const data = await res.json() as { ok: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Error ${res.status}`)
        setSubmitting(false)
        return
      }

      onSuccess(decision)
    } catch {
      setError('Network error — please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="vm-form">
      {/* Decision toggle */}
      <div className="vm-field">
        <label className="vm-label">Decision</label>
        <div className="vm-decision-group">
          {(['accept', 'modify', 'reject'] as Decision[]).map(d => (
            <button
              key={d}
              type="button"
              className={`vm-decision-btn vm-decision-btn--${d}${decision === d ? ' vm-decision-btn--active' : ''}`}
              onClick={() => setDecision(d)}
            >
              {DECISION_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Fields for Accept / Modify */}
      {decision !== 'reject' && (
        <>
          <div className="vm-field">
            <label className="vm-label">Confidence</label>
            <div className="vm-radio-group">
              {CONFIDENCE_OPTIONS.map(c => (
                <label key={c} className="vm-radio-label">
                  <input
                    type="radio"
                    name="confidence"
                    value={c}
                    checked={confidence === c}
                    onChange={() => setConfidence(c)}
                  />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div className="vm-field">
            <label className="vm-label" htmlFor="vf-summary">
              Summary <span className="vm-required">*</span>
            </label>
            <textarea
              id="vf-summary"
              className="vm-textarea"
              rows={3}
              placeholder="Brief summary of your assessment…"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              required
              maxLength={2000}
            />
          </div>
          <div className="vm-field">
            <label className="vm-label">
              Next step <span className="vm-required">*</span>
            </label>
            <div className="vm-radio-group">
              {NEXT_STEP_OPTIONS.map(opt => (
                <label key={opt.value} className="vm-radio-label">
                  <input
                    type="radio"
                    name="next-step"
                    value={opt.value}
                    checked={nextStepSelection === opt.value}
                    onChange={() => setNextStepSelection(opt.value as NextStepSelection)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
            {nextStepSelection === 'other' && (
              <input
                className="vm-input"
                type="text"
                placeholder="Describe the next step…"
                value={nextStepOther}
                onChange={e => setNextStepOther(e.target.value)}
                maxLength={500}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
              />
            )}
          </div>
        </>
      )}

      {/* Fields for Reject */}
      {decision === 'reject' && (
        <>
          <div className="vm-field">
            <label className="vm-label" htmlFor="vf-reason">
              Reason <span className="vm-required">*</span>
            </label>
            <textarea
              id="vf-reason"
              className="vm-textarea"
              rows={3}
              placeholder="Why should this fix be rejected?"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              required
              maxLength={2000}
            />
          </div>
          <div className="vm-field">
            <label className="vm-label" htmlFor="vf-blocking">Blocking issues</label>
            <input
              id="vf-blocking"
              className="vm-input"
              type="text"
              placeholder="What issues must be resolved?"
              value={blockingIssues}
              onChange={e => setBlockingIssues(e.target.value)}
              maxLength={500}
            />
          </div>
          <div className="vm-field">
            <label className="vm-label" htmlFor="vf-reconsider">To reconsider</label>
            <input
              id="vf-reconsider"
              className="vm-input"
              type="text"
              placeholder="What would need to change to reconsider?"
              value={toReconsider}
              onChange={e => setToReconsider(e.target.value)}
              maxLength={500}
            />
          </div>
        </>
      )}

      {error && <p className="vm-error">{error}</p>}

      <div className="vm-footer">
        <button type="button" className="vm-btn-cancel" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="submit"
          className={`vm-btn-submit vm-btn-submit--${decision}`}
          disabled={
            submitting || !csrfToken ||
            (decision !== 'reject' && (
              !nextStepSelection ||
              (nextStepSelection === 'other' && !nextStepOther.trim())
            ))
          }
        >
          {submitting ? 'Posting…' : `Post ${DECISION_LABELS[decision]} vote`}
        </button>
      </div>

      <p className="vm-disclaimer">
        This will post an OASIS-format comment to the GitHub PR using your account.
      </p>
    </form>
  )
}
