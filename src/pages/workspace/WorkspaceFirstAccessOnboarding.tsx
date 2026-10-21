import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { renderGuideMarkdown } from '../../components/GuideDocument'
import quickStartMarkdown from '../../../docs/quick-start.md?raw'
import { shouldShowReviewerOnboarding } from './workspaceOnboarding'
import './WorkspaceFirstAccessOnboarding.css'

const modalQuickStart = quickStartMarkdown.replace(/^# Quick Start\s*\n?/, '')

export default function WorkspaceFirstAccessOnboarding({ anotherOnboardingOpen = false }: { anotherOnboardingOpen?: boolean }) {
  const { user, loading: authLoading } = useAuth()
  const { preferences, preferencesReady, saving, save } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const [dismissedForSession, setDismissedForSession] = useState<string | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [savingDismissal, setSavingDismissal] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  const open = !authLoading && shouldShowReviewerOnboarding({
    pathname: location.pathname,
    login: user?.login ?? null,
    preferencesReady,
    reviewerOnboardingDismissed: preferences.reviewerOnboardingDismissed === true,
    dismissedForSession,
    anotherOnboardingOpen,
  })

  useEffect(() => {
    if (open && !wasOpen.current) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialogRef.current?.focus()
    } else if (!open && wasOpen.current) {
      previousFocus.current?.focus()
      previousFocus.current = null
    }
    wasOpen.current = open
  }, [open])

  const dismissForSession = () => {
    if (user) setDismissedForSession(user.login)
    setSaveError('')
  }

  const continueToFixes = async () => {
    if (dontShowAgain && user) {
      setSavingDismissal(true)
      setSaveError('')
      try {
        await save({ reviewerOnboardingDismissed: true })
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Your preference could not be saved. Please try again.')
        return
      } finally {
        setSavingDismissal(false)
      }
    }
    dismissForSession()
    navigate('/workspace/fixes')
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      dismissForSession()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ))
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) dismissForSession()
  }

  const handleGuideLink = (event: MouseEvent<HTMLElement>) => {
    const target = event.target
    if (target instanceof Element && target.closest('a[href]')) dismissForSession()
  }

  if (!open) return null

  return <div className="onboarding-modal-overlay workspace-first-access-overlay" onMouseDown={handleBackdropMouseDown}>
    <section
      ref={dialogRef}
      className="onboarding-modal workspace-first-access-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-first-access-title"
      tabIndex={-1}
      onKeyDown={handleDialogKeyDown}
    >
      <header className="onboarding-header workspace-first-access-header">
        <div>
          <span className="ws-eyebrow">OASIS WORKSPACE</span>
          <h1 id="workspace-first-access-title">Quick Start</h1>
        </div>
        <button type="button" className="onboarding-close-btn" onClick={dismissForSession} aria-label="Close Quick Start">×</button>
      </header>
      <div className="onboarding-content workspace-first-access-content">
        <article className="guide-content workspace-first-access-guide" onClick={handleGuideLink}>
          {renderGuideMarkdown(modalQuickStart)}
        </article>
        <nav className="workspace-first-access-guides" aria-label="More reviewer guides">
          <Link to="/reviewer-guide" onClick={dismissForSession}>Reviewer Guide</Link>
          <Link to="/worked-example" onClick={dismissForSession}>Worked Example</Link>
        </nav>
        {saveError && <p className="ws-error workspace-first-access-error" role="alert">{saveError}</p>}
        <div className="workspace-first-access-actions">
          <label className="workspace-first-access-suppress">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={event => setDontShowAgain(event.currentTarget.checked)}
              disabled={savingDismissal || saving}
            />
            <span>Don't show me this again</span>
          </label>
          <button type="button" className="ws-button ws-button--primary" onClick={() => void continueToFixes()} disabled={savingDismissal || saving}>
            {savingDismissal ? 'Saving…' : 'Continue to Candidate Fixes'}
          </button>
        </div>
      </div>
    </section>
  </div>
}
