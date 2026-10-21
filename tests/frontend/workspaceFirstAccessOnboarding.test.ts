import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  user: null as null | { login: string },
  authLoading: false,
  preferencesReady: true,
  reviewerOnboardingDismissed: false,
  saving: false,
  save: async (_patch: unknown) => {},
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mockState.user, loading: mockState.authLoading }),
}))

vi.mock('../../src/context/WorkspaceContext', () => ({
  useWorkspace: () => ({
    preferences: { reviewerOnboardingDismissed: mockState.reviewerOnboardingDismissed },
    preferencesReady: mockState.preferencesReady,
    saving: mockState.saving,
    save: mockState.save,
  }),
}))

import WorkspaceFirstAccessOnboarding from '../../src/pages/workspace/WorkspaceFirstAccessOnboarding'

function renderAt(path: string) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(WorkspaceFirstAccessOnboarding)))
}

describe('Workspace first-access onboarding dialog', () => {
  beforeEach(() => {
    mockState.user = { login: 'reviewer-one' }
    mockState.authLoading = false
    mockState.preferencesReady = true
    mockState.reviewerOnboardingDismissed = false
  })

  it('presents Quick Start on first Workspace access with a normal continue and persistent suppression option', () => {
    const html = renderAt('/workspace/fixes')
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Quick Start')
    expect(html).toContain('Continue to Candidate Fixes')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('show me this again')
    expect(html).toContain('href="/worked-example"')
  })

  it('waits for signed-in account preferences before deciding to show onboarding', () => {
    mockState.preferencesReady = false
    expect(renderAt('/workspace')).toBe('')
  })

  it('does not show for guests, outside Workspace, or accounts that opted out', () => {
    mockState.user = null
    expect(renderAt('/workspace')).toBe('')
    mockState.user = { login: 'reviewer-one' }
    expect(renderAt('/quick-start')).toBe('')
    mockState.reviewerOnboardingDismissed = true
    expect(renderAt('/workspace')).toBe('')
  })
})
