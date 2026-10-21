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
