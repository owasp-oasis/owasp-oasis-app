import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import './PreviewBanner.css'

type FeedbackState = 'idle' | 'open' | 'loading' | 'success' | 'error'
type Severity = 'bug' | 'suggestion' | 'other'

const DISMISS_KEY = 'preview_banner_dismissed'
const DISMISS_TTL = 60 * 60 * 1000 // 60 minutes

function isBannerDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const { dismissedAt } = JSON.parse(raw) as { dismissedAt: number }
    return Date.now() - dismissedAt < DISMISS_TTL
  } catch {
    return false
  }
}

export default function PreviewBanner() {
  const [dismissed, setDismissed] = useState(() => isBannerDismissed())
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<Severity>('bug')
  const [githubUsername, setGithubUsername] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [csrfToken, setCsrfToken] = useState<string | null>(null)

  // Sync body class and --banner-height with dismissed state
  useEffect(() => {
    if (dismissed) {
      document.body.classList.add('banner-dismissed')
    } else {
      document.body.classList.remove('banner-dismissed')
    }
    return () => {
      document.body.classList.remove('banner-dismissed')
    }
  }, [dismissed])

  // Fetch CSRF token on mount
  useEffect(() => {
    fetch('/api/csrf', { credentials: 'include' })
      .then(r => r.json())
      .then((d: unknown) => setCsrfToken((d as { token: string }).token))
      .catch(() => setErrorMsg('Failed to load security token — please refresh.'))
  }, [])

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ dismissedAt: Date.now() }))
    } catch { /* non-fatal */ }
    setDismissed(true)
  }

  if (dismissed) return null

  function openFeedback() {
    setFeedbackState('open')
  }

  function closeFeedback() {
    setFeedbackState('idle')
    setDescription('')
    setSeverity('bug')
    setGithubUsername('')
    setErrorMsg('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!description.trim()) {
      setErrorMsg('Please describe the issue.')
      return
    }
    if (!csrfToken) {
      setErrorMsg('Missing security token — please refresh.')
      return
    }
    setFeedbackState('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({
          description: description.trim(),
          severity,
          github_username: githubUsername.trim() || undefined,
        }),
      })
      if (res.ok) {
        setFeedbackState('success')
      } else {
        const data = await res.json() as { error?: string }
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
        setFeedbackState('error')
      }
    } catch {
      setErrorMsg('Network error. Please try again.')
      setFeedbackState('error')
    }
  }

  return (
    <>
      <div className="preview-banner" role="banner" aria-label="Preview notice">
        <div className="preview-banner-inner">
          <span className="preview-badge">Preview</span>
          <span className="preview-banner-text">
            Work in Progress &middot; This site is in active development. Bugs exist and are being fixed.
          </span>
          <button
            className="preview-report-btn"
            onClick={openFeedback}
            aria-expanded={feedbackState !== 'idle'}
          >
            Report a bug &rarr;
          </button>
          <button
            className="preview-dismiss-btn"
            onClick={handleDismiss}
            aria-label="Dismiss preview banner"
          >
            &times;
          </button>
        </div>
      </div>

      {feedbackState !== 'idle' && (
        <div className="feedback-overlay" onClick={closeFeedback} aria-hidden="true" />
      )}

      {feedbackState !== 'idle' && (
        <div className="feedback-panel" role="dialog" aria-modal="true" aria-label="Report a bug">
          <div className="feedback-panel-header">
            <h2>Report a bug</h2>
            <button
              className="feedback-close"
              onClick={closeFeedback}
              aria-label="Close feedback form"
            >
              &times;
            </button>
          </div>

          {feedbackState === 'success' ? (
            <div className="feedback-success">
              <div className="feedback-success-icon" aria-hidden="true">&#10003;</div>
              <p>Thanks &mdash; your report has been logged. We&rsquo;ll take a look.</p>
              <button className="btn btn-secondary" onClick={closeFeedback}>Close</button>
            </div>
          ) : (
            <form className="feedback-form" onSubmit={handleSubmit} noValidate>
              <p className="feedback-privacy-note">
                Reports are filed as public GitHub issues. Add your GitHub username if you
                want to be mentioned and notified. Never include credentials or private secrets.
              </p>
              <div className="feedback-field">
                <label htmlFor="feedback-severity">Type</label>
                <div className="feedback-severity-group">
                  {(['bug', 'suggestion', 'other'] as Severity[]).map(s => (
                    <label key={s} className={`feedback-severity-opt${severity === s ? ' feedback-severity-opt--active' : ''}`}>
                      <input
                        type="radio"
                        name="severity"
                        value={s}
                        checked={severity === s}
                        onChange={() => setSeverity(s)}
                        disabled={feedbackState === 'loading'}
                      />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="feedback-field">
                <label htmlFor="feedback-description">
                  Description <span className="required" aria-label="required">*</span>
                </label>
                <textarea
                  id="feedback-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What did you see? What did you expect?"
                  rows={4}
                  required
                  disabled={feedbackState === 'loading'}
                />
              </div>

              <div className="feedback-field">
                <label htmlFor="feedback-github-username">
                  GitHub username <span className="optional">(optional)</span>
                </label>
                <input
                  id="feedback-github-username"
                  type="text"
                  value={githubUsername}
                  onChange={e => setGithubUsername(e.target.value)}
                  placeholder="octocat"
                  autoComplete="off"
                  disabled={feedbackState === 'loading'}
                />
              </div>

              {(feedbackState === 'error') && (
                <p className="feedback-error" role="alert">{errorMsg}</p>
              )}
              {errorMsg && feedbackState === 'open' && (
                <p className="feedback-error" role="alert">{errorMsg}</p>
              )}

              <div className="feedback-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={feedbackState === 'loading'}
                >
                  {feedbackState === 'loading' ? 'Sending...' : 'Submit report'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeFeedback}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </>
  )
}
