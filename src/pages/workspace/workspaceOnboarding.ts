export interface ReviewerOnboardingVisibility {
  pathname: string
  login: string | null
  preferencesReady: boolean
  reviewerOnboardingDismissed: boolean
  dismissedForSession: string | null
  anotherOnboardingOpen: boolean
}

export function shouldShowReviewerOnboarding(state: ReviewerOnboardingVisibility): boolean {
  return state.pathname.startsWith('/workspace') &&
    state.login !== null &&
    state.preferencesReady &&
    !state.reviewerOnboardingDismissed &&
    state.dismissedForSession !== state.login &&
    !state.anotherOnboardingOpen
}

export type ReviewerOnboardingDismissalPath =
  | 'continue'
  | 'close'
  | 'escape'
  | 'backdrop'
  | 'reviewer-guide'
  | 'worked-example'
  | 'guide-content-link'

interface ReviewerOnboardingDismissalOptions {
  remember: boolean
  persistPreference: () => Promise<void>
  dismiss: () => void
  navigate: (destination: string) => void
  onPersistenceError: (error: unknown) => void
  isCurrent?: () => boolean
  destination?: string
}

/** Persist the opt-out before closing, keeping failures local to the onboarding dialog. */
export async function completeReviewerOnboardingDismissal(
  path: ReviewerOnboardingDismissalPath,
  options: ReviewerOnboardingDismissalOptions,
): Promise<boolean> {
  const isCurrent = () => options.isCurrent?.() !== false
  if (!isCurrent()) return false

  if (options.remember) {
    try {
      await options.persistPreference()
    } catch (error) {
      if (isCurrent()) options.onPersistenceError(error)
      return false
    }
  }

  if (!isCurrent()) return false
  options.dismiss()

  if (path === 'reviewer-guide') options.navigate('/reviewer-guide')
  else if (path === 'worked-example') options.navigate('/worked-example')
  else if (path === 'guide-content-link' && options.destination) options.navigate(options.destination)

  return true
}
