import { describe, expect, it } from 'vitest'
import { WORKSPACE_DEFAULTS, validateWorkspacePreferences } from '../../worker/workspacePreferences'
import { shouldShowReviewerOnboarding } from '../../src/pages/workspace/workspaceOnboarding'

const initialState = {
  pathname: '/workspace/fixes',
  login: 'reviewer-one',
  preferencesReady: true,
  reviewerOnboardingDismissed: false,
  dismissedForSession: null,
  anotherOnboardingOpen: false,
}

describe('first-access Workspace onboarding', () => {
  it('opens for a signed-in user who enters the Workspace without suppression', () => {
    expect(shouldShowReviewerOnboarding(initialState)).toBe(true)
  })

  it.each([
    { login: null },
    { pathname: '/quick-start' },
    { preferencesReady: false },
    { reviewerOnboardingDismissed: true },
    { anotherOnboardingOpen: true },
  ])('does not open when onboarding should be suppressed: %j', patch => {
    expect(shouldShowReviewerOnboarding({ ...initialState, ...patch })).toBe(false)
  })

  it('keeps a normal dismissal for this account during the current app session', () => {
    expect(shouldShowReviewerOnboarding({ ...initialState, dismissedForSession: 'reviewer-one' })).toBe(false)
    expect(shouldShowReviewerOnboarding({ ...initialState, login: 'reviewer-two', dismissedForSession: 'reviewer-one' })).toBe(true)
  })

  it('stores persistent suppression as an optional account preference, outside resettable defaults', () => {
    expect(Object.hasOwn(WORKSPACE_DEFAULTS, 'reviewerOnboardingDismissed')).toBe(false)
    expect(validateWorkspacePreferences({ reviewerOnboardingDismissed: true })).toEqual({ reviewerOnboardingDismissed: true })
    expect(validateWorkspacePreferences({ reviewerOnboardingDismissed: false })).toEqual({ reviewerOnboardingDismissed: false })
    expect(validateWorkspacePreferences({ reviewerOnboardingDismissed: 'yes' })).toBeNull()
  })
})
