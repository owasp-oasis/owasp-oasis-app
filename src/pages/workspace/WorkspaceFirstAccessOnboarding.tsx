import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { renderGuideMarkdown } from '../../components/GuideDocument'
import quickStartMarkdown from '../../../docs/quick-start.md?raw'
import { completeReviewerOnboardingDismissal, shouldShowReviewerOnboarding, type ReviewerOnboardingDismissalPath } from './workspaceOnboarding'
import './WorkspaceFirstAccessOnboarding.css'

const modalQuickStart = quickStartMarkdown.replace(/^# Quick Start\s*\n?/, '')

export default function WorkspaceFirstAccessOnboarding({ anotherOnboardingOpen = false }: { anotherOnboardingOpen?: boolean }) {
  const { user, loading: authLoading } = useAuth()
  const { preferences, preferencesReady, saveQuietly } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const [dismissedForSession, setDismissedForSession] = useState<string | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [savingDismissal, setSavingDismissal] = useState(false)
  const [saveError, setSaveError] = useState('')
  const dismissalInFlight = useRef(false)
  const dismissalGeneration = useRef(0)
  const currentLogin = user?.login ?? null
  const currentLoginRef = useRef(currentLogin)
  currentLoginRef.current = currentLogin
  const currentLocationKeyRef = useRef(location.key)
  currentLocationKeyRef.current = location.key
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
    const generation = ++dismissalGeneration.current
    dismissalInFlight.current = false
    setDismissedForSession(null)
    setDontShowAgain(false)
    setSavingDismissal(false)
    setSaveError('')
    return () => {
      if (dismissalGeneration.current === generation) dismissalGeneration.current += 1
      dismissalInFlight.current = false
    }
  }, [currentLogin])

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

  const dismissFromPath = async (path: ReviewerOnboardingDismissalPath, destination?: string) => {
    if (dismissalInFlight.current) return
    dismissalInFlight.current = true
    const login = user?.login ?? null
    const generation = dismissalGeneration.current
    const locationKey = location.key
    const remember = dontShowAgain && login !== null
    const isCurrentAccountSession = () => dismissalGeneration.current === generation && currentLoginRef.current === login
    const isCurrent = () => isCurrentAccountSession() && currentLocationKeyRef.current === locationKey
    if (remember) {
      setSavingDismissal(true)
      setSaveError('')
    }
    try {
      await completeReviewerOnboardingDismissal(path, {
        remember,
        persistPreference: () => saveQuietly({ reviewerOnboardingDismissed: true }),
        dismiss: () => {
          if (login) setDismissedForSession(login)
          setSaveError('')
        },
        navigate,
        destination,
        isCurrent,
        onPersistenceError: error => {
          if (isCurrent()) setSaveError(error instanceof Error ? error.message : 'Your preference could not be saved. Please try again.')
        },
      })
    } finally {
      if (isCurrentAccountSession()) {
        dismissalInFlight.current = false
        if (remember) setSavingDismissal(false)
      }
    }
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      void dismissFromPath('escape')
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
    if (event.target === event.currentTarget) void dismissFromPath('backdrop')
  }

  const handleGuideLink = (event: MouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const link = target.closest<HTMLAnchorElement>('a[href]')
    if (!link || link.target === '_blank') return
    if (isModifiedLinkClick(event)) return
    const destination = link.getAttribute('href')
    if (!destination?.startsWith('/') || destination.startsWith('//')) return
    event.preventDefault()
    void dismissFromPath('guide-content-link', destination)
  }

  const handleGuideNavigation = (path: 'reviewer-guide' | 'worked-example') => (event: MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedLinkClick(event)) return
    event.preventDefault()
    void dismissFromPath(path)
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
        <button type="button" className="onboarding-close-btn" onClick={() => void dismissFromPath('close')} aria-label="Close Quick Start">×</button>
      </header>
      <div className="onboarding-content workspace-first-access-content">
        <article className="guide-content workspace-first-access-guide" onClickCapture={handleGuideLink}>
          {renderGuideMarkdown(modalQuickStart)}
        </article>
        <nav className="workspace-first-access-guides" aria-label="More reviewer guides">
          <Link to="/reviewer-guide" onClick={handleGuideNavigation('reviewer-guide')}>Reviewer Guide</Link>
          <Link to="/worked-example" onClick={handleGuideNavigation('worked-example')}>Worked Example</Link>
        </nav>
        {saveError && <p className="ws-error workspace-first-access-error" role="alert">{saveError}</p>}
        <div className="workspace-first-access-actions">
          <label className="workspace-first-access-suppress">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={event => {
                setDontShowAgain(event.currentTarget.checked)
                if (!event.currentTarget.checked) setSaveError('')
              }}
              disabled={savingDismissal}
            />
            <span>Don't show me this again</span>
          </label>
          <button type="button" className="ws-button ws-button--primary" onClick={() => void dismissFromPath('continue')} disabled={savingDismissal}>
            {savingDismissal ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    </section>
  </div>
}

function isModifiedLinkClick(event: MouseEvent<HTMLAnchorElement | HTMLElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}
