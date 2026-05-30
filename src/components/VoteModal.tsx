import { useState, useEffect, useRef, type FormEvent } from 'react'
import './VoteModal.css'

type Decision = 'accept' | 'modify' | 'reject'

interface PR {
  id: number
  repo_name: string
  number: number
  title: string
}

interface Props {
  pr: PR
  onClose: () => void
  onSuccess: (decision: Decision) => void
}

const DECISION_LABELS: Record<Decision, string> = {
  accept: 'Accept',
  modify: 'Modify',
  reject: 'Reject',
}

const CONFIDENCE_OPTIONS = ['Low', 'Medium', 'High'] as const

export default function VoteModal({ pr, onClose, onSuccess }: Props) {
  const [decision, setDecision] = useState<Decision>('accept')
  const [confidence, setConfidence] = useState<string>('Medium')
  const [summary, setSummary] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [blockingIssues, setBlockingIssues] = useState('')
  const [toReconsider, setToReconsider] = useState('')
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Fetch CSRF token on mount
  useEffect(() => {
    fetch('/api/csrf', { credentials: 'include' })
      .then(r => r.json())
      .then((d: unknown) => setCsrfToken((d as { token: string }).token))
      .catch(() => setError('Failed to load security token — please refresh.'))
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Close on outside click
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!csrfToken) { setError('Missing security token — please refresh.'); return }
    setSubmitting(true)
    setError(null)

    try {
      const body: Record<string, unknown> = {
        pr_id: pr.id,
        decision,
      }
      if (decision === 'reject') {
        body.summary          = summary
        body.blocking_issues  = blockingIssues
        body.to_reconsider    = toReconsider
      } else {
        body.confidence = confidence
        body.summary    = summary
        body.next_step  = nextStep
      }

      const res = await fetch('/api/vote', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
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
    <div
      className="vm-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={`Vote on PR #${pr.number}`}
    >
      <div className="vm-card">
        <div className="vm-header">
          <div className="vm-title-row">
            <h2 className="vm-title">Cast your OASIS vote</h2>
            <button className="vm-close" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <p className="vm-pr-label">
            <span className="vm-repo">{pr.repo_name}</span>
            {' — '}
            <a
              href={`https://github.com/owasp-oasis/${pr.repo_name}/pull/${pr.number}`}
              target="_blank"
              rel="noopener noreferrer"
              className="vm-pr-link"
            >
              #{pr.number} {pr.title.length > 60 ? pr.title.slice(0, 60) + '…' : pr.title}
            </a>
          </p>
        </div>

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
                <label className="vm-label" htmlFor="vm-confidence">Confidence</label>
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
                <label className="vm-label" htmlFor="vm-summary">
                  Summary <span className="vm-required">*</span>
                </label>
                <textarea
                  id="vm-summary"
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
                <label className="vm-label" htmlFor="vm-next-step">Next step</label>
                <input
                  id="vm-next-step"
                  className="vm-input"
                  type="text"
                  placeholder="e.g. Ready for upstream PR submission"
                  value={nextStep}
                  onChange={e => setNextStep(e.target.value)}
                  maxLength={500}
                />
              </div>
            </>
          )}

          {/* Fields for Reject */}
          {decision === 'reject' && (
            <>
              <div className="vm-field">
                <label className="vm-label" htmlFor="vm-reason">
                  Reason <span className="vm-required">*</span>
                </label>
                <textarea
                  id="vm-reason"
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
                <label className="vm-label" htmlFor="vm-blocking">Blocking issues</label>
                <input
                  id="vm-blocking"
                  className="vm-input"
                  type="text"
                  placeholder="What issues must be resolved?"
                  value={blockingIssues}
                  onChange={e => setBlockingIssues(e.target.value)}
                  maxLength={500}
                />
              </div>
              <div className="vm-field">
                <label className="vm-label" htmlFor="vm-reconsider">To reconsider</label>
                <input
                  id="vm-reconsider"
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
              disabled={submitting || !csrfToken}
            >
              {submitting ? 'Posting…' : `Post ${DECISION_LABELS[decision]} vote`}
            </button>
          </div>

          <p className="vm-disclaimer">
            This will post an OASIS-format comment to the GitHub PR using your account.
          </p>
        </form>
      </div>
    </div>
  )
}
