/**
 * OnboardingModal - Multi-step validator onboarding and "What's New" modal
 *
 * Features:
 * - Displays on first login OR when user has zero votes
 * - 6 steps: Welcome, Languages, Severity, Experience, Ready, WhatsNew
 * - Dismiss button on WhatsNew marks onboarding_version as seen without navigation
 * - "Get Started" button navigates to /leaderboards with URL params for filtering
 * - "Update Preferences" from Nav allows re-opening at any time
 */

import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import './OnboardingModal.css'

import WelcomeStep from './steps/WelcomeStep'
import LanguagesStep from './steps/LanguagesStep'
import SeverityStep from './steps/SeverityStep'
import ExperienceStep from './steps/ExperienceStep'
import ReadyStep from './steps/ReadyStep'
import WhatsNewStep from './steps/WhatsNewStep'

export type Step = 'welcome' | 'languages' | 'severity' | 'experience' | 'ready' | 'whatsnew'

interface OnboardingState {
  languages: string[]
  severities: string[]
  experience: string | null
}

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  forceShow?: boolean // Force showing the modal (e.g., from Nav "Update Preferences")
}

export default function OnboardingModal({ isOpen, onClose, forceShow = false }: OnboardingModalProps) {
  const { user, preferences, current_version, updatePreferences } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [state, setState] = useState<OnboardingState>({
    languages: preferences?.languages ?? [],
    severities: preferences?.severities ?? [],
    experience: preferences?.experience ?? null,
  })

  // Auto-open modal on first login or zero votes (detected by onboarding_version being null/different)
  const shouldAutoOpen = user && current_version && (
    preferences?.onboarding_version !== current_version ||
    !preferences?.onboarding_version
  )

  useEffect(() => {
    // Sync state with preferences when they load
    if (preferences) {
      setState({
        languages: preferences.languages ?? [],
        severities: preferences.severities ?? [],
        experience: preferences.experience ?? null,
      })
    }
  }, [preferences])

  const handleDismiss = async () => {
    // Mark the current version as seen without changing preferences
    await updatePreferences({ onboarding_version: current_version })
    onClose()
  }

  const handleNext = () => {
    const steps: Step[] = ['welcome', 'languages', 'severity', 'experience', 'ready', 'whatsnew']
    const currentIndex = steps.indexOf(step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1])
    }
  }

  const handlePrev = () => {
    const steps: Step[] = ['welcome', 'languages', 'severity', 'experience', 'ready', 'whatsnew']
    const currentIndex = steps.indexOf(step)
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
    }
  }

  const handleComplete = async () => {
    // Save preferences and navigate to leaderboards with URL params
    await updatePreferences({
      languages: state.languages.length > 0 ? state.languages : null,
      severities: state.severities.length > 0 ? state.severities : null,
      experience: state.experience,
      onboarding_version: current_version,
    })

    // Build URL params for filtering
    const params = new URLSearchParams()
    if (state.languages.length > 0) {
      params.set('lang', state.languages.join(','))
    }
    if (state.severities.length > 0) {
      params.set('severity', state.severities.join(','))
    }
    if (state.experience) {
      params.set('exp', state.experience)
    }

    onClose()
    navigate(`/leaderboards?${params.toString()}`)
  }

  if (!isOpen || !user) return null

  // Only show if: forceShow is true (from Nav), OR (modal should auto-open AND not already dismissed)
  const shouldShow = forceShow || (shouldAutoOpen && !preferences?.onboarding_version)

  if (!shouldShow && !forceShow) return null

  const progressSteps: Step[] = ['welcome', 'languages', 'severity', 'experience', 'ready', 'whatsnew']
  const progressIndex = progressSteps.indexOf(step)

  return (
    <div className="onboarding-modal-overlay">
      <div className="onboarding-modal">
        {/* Progress bar */}
        <div className="onboarding-progress">
          <div className="onboarding-progress-bar">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${((progressIndex + 1) / progressSteps.length) * 100}%` }}
            />
          </div>
          <div className="onboarding-progress-text">
            Step {progressIndex + 1} of {progressSteps.length}
          </div>
        </div>

        {/* Content */}
        <div className="onboarding-content">
          {step === 'welcome' && <WelcomeStep onNext={handleNext} />}
          {step === 'languages' && (
            <LanguagesStep
              selected={state.languages}
              onSelect={(langs) => setState({ ...state, languages: langs })}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          )}
          {step === 'severity' && (
            <SeverityStep
              selected={state.severities}
              onSelect={(sevs) => setState({ ...state, severities: sevs })}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          )}
          {step === 'experience' && (
            <ExperienceStep
              selected={state.experience}
              onSelect={(exp) => setState({ ...state, experience: exp })}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          )}
          {step === 'ready' && (
            <ReadyStep
              languages={state.languages}
              severities={state.severities}
              experience={state.experience}
              onNext={handleNext}
              onPrev={handlePrev}
            />
          )}
          {step === 'whatsnew' && (
            <WhatsNewStep
              onDismiss={handleDismiss}
              onGetStarted={handleComplete}
            />
          )}
        </div>

        {/* Dismiss button (top-right, always visible) */}
        {step !== 'whatsnew' && (
          <button
            className="onboarding-close-btn"
            onClick={onClose}
            aria-label="Close onboarding modal"
            title="Skip onboarding"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}
