// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from '../../src/context/WorkspaceContext'
import WorkspaceFirstAccessOnboarding from '../../src/pages/workspace/WorkspaceFirstAccessOnboarding'

const candidatePath = '/workspace/fixes/acme/repo/14'

const interactionMocks = vi.hoisted(() => ({
  user: null as null | { login: string },
  defaults: {
    repositories: [] as number[],
    cwes: [] as string[],
    minimumSeverity: 'low',
    hideClosed: true,
    hideVoted: true,
    keyboardShortcuts: true,
    layout: 'split',
    diffView: 'split',
  },
  savedByLogin: {} as Record<string, Record<string, unknown>>,
  teamGet: vi.fn(),
  teamPut: vi.fn(),
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: interactionMocks.user, loading: false }),
}))

vi.mock('../../src/pages/workspace/teamApi', () => ({
  teamGet: (path: string, signal?: AbortSignal) => interactionMocks.teamGet(path, signal),
  teamPut: (path: string, patch: Record<string, unknown>) => interactionMocks.teamPut(path, patch),
  errorMessage: (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.',
}))

function LocationProbe() {
  const { pathname } = useLocation()
  return createElement('output', { 'data-testid': 'current-path' }, pathname)
}

function WorkspaceProbe() {
  const { error, preferences, save } = useWorkspace()
  const navigate = useNavigate()
  return createElement('aside', null,
    createElement('output', { 'data-testid': 'workspace-error' }, error ?? ''),
    createElement('output', { 'data-testid': 'workspace-layout' }, preferences.layout),
    createElement('button', {
      type: 'button',
      autoFocus: true,
      onClick: () => { void save({ layout: 'focus' }) },
    }, 'Save normal preference'),
    createElement('button', {
      type: 'button',
      onClick: () => navigate(candidatePath),
    }, 'Return to Workspace'),
    createElement('button', {
      type: 'button',
      onClick: () => navigate(-1),
    }, 'Browser Back'),
  )
}

function appTree(initialEntries: string[], includeOnboarding = true): ReactElement {
  return createElement(MemoryRouter, { initialEntries },
    createElement(WorkspaceProvider, null,
      createElement(LocationProbe),
      includeOnboarding ? createElement(WorkspaceFirstAccessOnboarding) : null,
      createElement(WorkspaceProbe),
    ),
  )
}

function renderWorkspace(initialEntries: string[] = [candidatePath]) {
  const view = render(appTree(initialEntries))
  return {
    ...view,
    switchUser(login: string) {
      interactionMocks.user = { login }
      view.rerender(appTree(initialEntries))
    },
    removeOnboarding() {
      view.rerender(appTree(initialEntries, false))
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function openDialog() {
  return screen.findByRole('dialog', { name: 'Quick Start' })
}

async function dismissWith(label: string, user: ReturnType<typeof userEvent.setup>, container: HTMLElement) {
  const dialog = await openDialog()
  if (label === 'Continue') {
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
  } else if (label === 'X') {
    await user.click(within(dialog).getByRole('button', { name: 'Close Quick Start' }))
  } else if (label === 'Escape') {
    dialog.focus()
    await user.keyboard('{Escape}')
  } else if (label === 'backdrop') {
    const backdrop = container.querySelector('.workspace-first-access-overlay')
    if (!backdrop) throw new Error('Workspace onboarding backdrop was not rendered')
    fireEvent.mouseDown(backdrop)
  } else if (label === 'Reviewer Guide') {
    const links = within(dialog).getAllByRole('link', { name: 'Reviewer Guide' })
    await user.click(links[links.length - 1])
  } else if (label === 'Worked Example') {
    await user.click(within(dialog).getByRole('link', { name: 'Worked Example' }))
  }
}

afterEach(cleanup)

beforeEach(() => {
  interactionMocks.user = { login: 'reviewer-one' }
  interactionMocks.savedByLogin = {}
  interactionMocks.teamGet.mockReset()
  interactionMocks.teamPut.mockReset()
  interactionMocks.teamGet.mockImplementation(async (path: string) => {
    if (path === '/api/preferences/workspace') {
      const login = interactionMocks.user?.login ?? 'anonymous'
      return { preferences: { ...interactionMocks.defaults, ...interactionMocks.savedByLogin[login] } }
    }
    if (path === '/api/csrf') return { token: 'test-csrf' }
    throw new Error(`Unexpected Workspace request: ${path}`)
  })
  interactionMocks.teamPut.mockImplementation(async (_path: string, patch: Record<string, unknown>) => {
    const login = interactionMocks.user?.login ?? 'anonymous'
    const preferences = { ...interactionMocks.defaults, ...interactionMocks.savedByLogin[login], ...patch }
    interactionMocks.savedByLogin[login] = preferences
    return { preferences }
  })
})

describe('Workspace first-access onboarding interactions', () => {
  const actions = ['Continue', 'X', 'Escape', 'backdrop', 'Reviewer Guide', 'Worked Example']

  for (const checked of [false, true]) {
    it.each(actions)(`${checked ? 'checked' : 'unchecked'}: %s dismissal`, async label => {
      const user = userEvent.setup()
      const view = renderWorkspace()
      const dialog = await openDialog()
      const checkbox = within(dialog).getByRole('checkbox', { name: "Don't show me this again" })
      if (checked) await user.click(checkbox)

      await dismissWith(label, user, view.container)

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(interactionMocks.teamPut).toHaveBeenCalledTimes(checked ? 1 : 0)
      if (checked) {
        expect(interactionMocks.teamPut).toHaveBeenCalledWith('/api/preferences/workspace', { reviewerOnboardingDismissed: true })
        expect(interactionMocks.savedByLogin['reviewer-one']?.reviewerOnboardingDismissed).toBe(true)
        expect(view.container.querySelector('.ws-toast')).toBeNull()
      } else {
        expect(interactionMocks.savedByLogin['reviewer-one']).toBeUndefined()
      }

      const expectedPath = label === 'Reviewer Guide' ? '/reviewer-guide'
        : label === 'Worked Example' ? '/worked-example'
          : candidatePath
      expect(screen.getByTestId('current-path').textContent).toBe(expectedPath)

      if (!checked && expectedPath !== candidatePath) {
        await user.click(screen.getByRole('button', { name: 'Return to Workspace' }))
        await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe(candidatePath))
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(interactionMocks.teamPut).not.toHaveBeenCalled()
      }
    })
  }

  it('waits for checked suppression to persist before navigating to a guide', async () => {
    const user = userEvent.setup()
    const pendingWrite = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamPut.mockImplementationOnce(() => pendingWrite.promise)
    const view = renderWorkspace()
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await user.click(within(dialog).getByRole('link', { name: 'Worked Example' }))

    await waitFor(() => expect(interactionMocks.teamPut).toHaveBeenCalledOnce())
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)

    await act(async () => pendingWrite.resolve({ preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('current-path').textContent).toBe('/worked-example')
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()
    expect(view.container).toBeTruthy()
  })

  it('keeps a deep-linked candidate route after Continue', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
  })

  it.each([false, true])('handles an ordinary Quick Start guide-content link with suppression %s', async checked => {
    const user = userEvent.setup()
    renderWorkspace()
    const dialog = await openDialog()
    const checkbox = within(dialog).getByRole('checkbox', { name: "Don't show me this again" })
    if (checked) await user.click(checkbox)
    const reviewerGuideContentLink = within(dialog).getAllByRole('link', { name: 'Reviewer Guide' })[0]
    await user.click(reviewerGuideContentLink)

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('current-path').textContent).toBe('/reviewer-guide')
    expect(interactionMocks.teamPut).toHaveBeenCalledTimes(checked ? 1 : 0)
    if (checked) expect(interactionMocks.savedByLogin['reviewer-one']?.reviewerOnboardingDismissed).toBe(true)
  })

  it('does not navigate after a failed guide preference save and allows retry', async () => {
    const user = userEvent.setup()
    interactionMocks.teamPut.mockRejectedValueOnce(new Error('Preference service unavailable'))
    renderWorkspace()
    let dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    const reviewerGuide = within(dialog).getAllByRole('link', { name: 'Reviewer Guide' }).at(-1)!
    await user.click(reviewerGuide)

    expect((await screen.findByRole('alert')).textContent).toContain('Preference service unavailable')
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
    expect(screen.getByTestId('workspace-error').textContent).toBe('')
    expect(screen.queryByText('Preferences saved')).toBeNull()

    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getAllByRole('link', { name: 'Reviewer Guide' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('current-path').textContent).toBe('/reviewer-guide')
    expect(interactionMocks.teamPut).toHaveBeenCalledTimes(2)
  })

  it('lets the user uncheck suppression after a failed save and dismiss without another write', async () => {
    const user = userEvent.setup()
    interactionMocks.teamPut.mockRejectedValueOnce(new Error('Preference service unavailable'))
    renderWorkspace()
    let dialog = await openDialog()
    const checkbox = within(dialog).getByRole('checkbox', { name: "Don't show me this again" })
    await user.click(checkbox)
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toBeTruthy()

    dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Close Quick Start' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()
    expect(screen.getByTestId('workspace-error').textContent).toBe('')
  })

  it('resets checkbox, error, and in-flight dismissal state when the account changes', async () => {
    const user = userEvent.setup()
    interactionMocks.teamPut.mockRejectedValueOnce(new Error('Account A save failed'))
    const view = renderWorkspace()
    let dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Account A save failed')

    view.switchUser('reviewer-two')
    dialog = await openDialog()
    await waitFor(() => expect((within(dialog).getByRole('checkbox', { name: "Don't show me this again" }) as HTMLInputElement).checked).toBe(false))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('workspace-error').textContent).toBe('')
    await user.click(within(dialog).getByRole('button', { name: 'Close Quick Start' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()
    expect(interactionMocks.savedByLogin['reviewer-two']).toBeUndefined()
  })

  it('does not carry one account session dismissal over to another account', async () => {
    const user = userEvent.setup()
    const view = renderWorkspace()
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Close Quick Start' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    view.switchUser('reviewer-two')
    expect(await openDialog()).toBeTruthy()
    expect(interactionMocks.teamPut).not.toHaveBeenCalled()
  })

  it('keeps the new account onboarding usable while the previous account save is pending', async () => {
    const user = userEvent.setup()
    const pendingWrite = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamPut.mockImplementationOnce(() => pendingWrite.promise)
    const view = renderWorkspace()
    let dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(interactionMocks.teamPut).toHaveBeenCalledOnce())

    view.switchUser('reviewer-two')
    dialog = await openDialog()
    const checkbox = within(dialog).getByRole('checkbox', { name: "Don't show me this again" })
    const continueButton = within(dialog).getByRole('button', { name: 'Continue' })
    expect((checkbox as HTMLInputElement).checked).toBe(false)
    expect((checkbox as HTMLInputElement).disabled).toBe(false)
    expect((continueButton as HTMLButtonElement).disabled).toBe(false)

    await user.click(continueButton)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()

    await act(async () => pendingWrite.resolve({ preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true } }))
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(interactionMocks.savedByLogin['reviewer-two']).toBeUndefined()
  })

  it('waits for persisted suppression before rendering for an account that opted out', async () => {
    const preferences = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamGet.mockImplementation(async (path: string) => {
      if (path === '/api/preferences/workspace') return preferences.promise
      return { token: 'test-csrf' }
    })
    renderWorkspace()
    expect(screen.queryByRole('dialog')).toBeNull()

    await act(async () => preferences.resolve({
      preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true },
    }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(interactionMocks.teamPut).not.toHaveBeenCalled()
  })

  it('does not let a stale preference read for the previous account replace the current account settings', async () => {
    const accountARead = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamGet.mockImplementation(async (path: string) => {
      if (path !== '/api/preferences/workspace') return { token: 'test-csrf' }
      if (interactionMocks.user?.login === 'reviewer-one') return accountARead.promise
      return { preferences: { ...interactionMocks.defaults, layout: 'table', reviewerOnboardingDismissed: false } }
    })
    const view = renderWorkspace()
    expect(screen.queryByRole('dialog')).toBeNull()

    view.switchUser('reviewer-two')
    const dialog = await openDialog()
    expect(screen.getByTestId('workspace-layout').textContent).toBe('table')

    await act(async () => accountARead.resolve({ preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true } }))
    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(screen.getByTestId('workspace-layout').textContent).toBe('table')
  })

  it('rejects a queued quiet save when its captured account changes before execution', async () => {
    const user = userEvent.setup()
    const firstSave = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamPut.mockImplementationOnce(() => firstSave.promise)
    const view = renderWorkspace()
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await user.click(screen.getByRole('button', { name: 'Save normal preference' }))
    await waitFor(() => expect(interactionMocks.teamPut).toHaveBeenCalledOnce())

    await user.click(within(dialog).getAllByRole('link', { name: 'Reviewer Guide' }).at(-1)!)
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()
    view.switchUser('reviewer-two')
    await openDialog()

    await act(async () => firstSave.resolve({ preferences: { ...interactionMocks.defaults, layout: 'focus' } }))
    await waitFor(() => expect(screen.getByTestId('workspace-layout').textContent).toBe('split'))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((within(screen.getByRole('dialog')).getByRole('checkbox', { name: "Don't show me this again" }) as HTMLInputElement).checked).toBe(false)
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('guards repeated dismissal events so one checked action causes one write and one navigation', async () => {
    const pendingWrite = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamPut.mockImplementationOnce(() => pendingWrite.promise)
    const view = renderWorkspace()
    const dialog = await openDialog()
    await userEvent.setup().click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))

    const continueButton = within(dialog).getByRole('button', { name: 'Continue' })
    fireEvent.click(continueButton)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close Quick Start' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(within(dialog).getAllByRole('link', { name: 'Reviewer Guide' }).at(-1)!)

    await waitFor(() => expect(interactionMocks.teamPut).toHaveBeenCalledOnce())
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
    await act(async () => pendingWrite.resolve({ preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true } }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
    expect(interactionMocks.teamPut).toHaveBeenCalledOnce()
    expect(view.container).toBeTruthy()
  })

  it('does not navigate or update the unmounted onboarding after an in-flight save completes', async () => {
    const pendingWrite = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamPut.mockImplementationOnce(() => pendingWrite.promise)
    const view = renderWorkspace()
    const dialog = await openDialog()
    await userEvent.setup().click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await userEvent.setup().click(within(dialog).getByRole('link', { name: 'Worked Example' }))
    await waitFor(() => expect(interactionMocks.teamPut).toHaveBeenCalledOnce())

    view.removeOnboarding()
    await act(async () => pendingWrite.resolve({ preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true } }))
    expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('retains normal Workspace preference success toast and error behavior', async () => {
    const user = userEvent.setup()
    const view = renderWorkspace()
    await openDialog()
    await user.click(screen.getByRole('button', { name: 'Save normal preference' }))
    expect(await screen.findByText('Preferences saved')).toBeTruthy()
    expect(view.container.querySelector('.ws-toast')).toBeTruthy()
    expect(screen.getByTestId('workspace-error').textContent).toBe('')
    expect(interactionMocks.savedByLogin['reviewer-one']?.layout).toBe('focus')

    view.unmount()
    cleanup()
    interactionMocks.savedByLogin = {}
    interactionMocks.teamPut.mockRejectedValueOnce(new Error('Normal preference failed'))
    renderWorkspace()
    await screen.findByRole('dialog')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Save normal preference' }))
    await waitFor(() => expect(screen.getByTestId('workspace-error').textContent).toBe('Normal preference failed'))
    expect(screen.queryByText('Preferences saved')).toBeNull()
  })

  it('does not persist merely because browser Back leaves Workspace', async () => {
    const user = userEvent.setup()
    renderWorkspace(['/quick-start', candidatePath])
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await user.click(screen.getByRole('button', { name: 'Browser Back' }))

    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/quick-start'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(interactionMocks.teamPut).not.toHaveBeenCalled()
  })

  it('does not override browser Back with a delayed guide navigation', async () => {
    const user = userEvent.setup()
    const pendingWrite = deferred<{ preferences: Record<string, unknown> }>()
    interactionMocks.teamPut.mockImplementationOnce(() => pendingWrite.promise)
    renderWorkspace(['/quick-start', candidatePath])
    const dialog = await openDialog()
    await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
    await user.click(within(dialog).getByRole('link', { name: 'Worked Example' }))
    await waitFor(() => expect(interactionMocks.teamPut).toHaveBeenCalledOnce())

    await user.click(screen.getByRole('button', { name: 'Browser Back' }))
    await waitFor(() => expect(screen.getByTestId('current-path').textContent).toBe('/quick-start'))
    await act(async () => pendingWrite.resolve({ preferences: { ...interactionMocks.defaults, reviewerOnboardingDismissed: true } }))

    expect(screen.getByTestId('current-path').textContent).toBe('/quick-start')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('preserves accessible focus handling and named dialog controls', async () => {
    const user = userEvent.setup()
    renderWorkspace()
    const dialog = await openDialog()
    const close = within(dialog).getByRole('button', { name: 'Close Quick Start' })
    const continueButton = within(dialog).getByRole('button', { name: 'Continue' })
    const checkbox = within(dialog).getByRole('checkbox', { name: "Don't show me this again" })
    const priorFocus = screen.getByRole('button', { name: 'Save normal preference' })

    expect(document.activeElement).toBe(dialog)
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(continueButton)
    fireEvent.keyDown(continueButton, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    expect(checkbox).toBeTruthy()

    await user.click(close)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(priorFocus))
  })

  const links = ['Reviewer Guide navigation', 'Worked Example navigation', 'Reviewer Guide in Quick Start'] as const
  const modifiedClicks = [
    { label: 'Ctrl-click', type: 'click', init: { ctrlKey: true, button: 0 } },
    { label: 'Cmd-click', type: 'click', init: { metaKey: true, button: 0 } },
    { label: 'Shift-click', type: 'click', init: { shiftKey: true, button: 0 } },
    { label: 'Alt-click', type: 'click', init: { altKey: true, button: 0 } },
    { label: 'middle-click', type: 'auxclick', init: { button: 1 } },
  ] as const

  for (const link of links) {
    for (const modified of modifiedClicks) {
      it(`${modified.label} on ${link} keeps browser navigation and does not claim suppression`, async () => {
        const user = userEvent.setup()
        renderWorkspace()
        const dialog = await openDialog()
        await user.click(within(dialog).getByRole('checkbox', { name: "Don't show me this again" }))
        const reviewerLinks = within(dialog).getAllByRole('link', { name: 'Reviewer Guide' })
        const target = link === 'Worked Example navigation'
          ? within(dialog).getByRole('link', { name: 'Worked Example' })
          : link === 'Reviewer Guide in Quick Start' ? reviewerLinks[0] : reviewerLinks[reviewerLinks.length - 1]
        const event = new MouseEvent(modified.type, { bubbles: true, cancelable: true, ...modified.init })
        fireEvent(target, event)

        expect(event.defaultPrevented).toBe(false)
        expect(screen.getByTestId('current-path').textContent).toBe(candidatePath)
        expect(screen.getByRole('dialog')).toBeTruthy()
        expect((within(screen.getByRole('dialog')).getByRole('checkbox', { name: "Don't show me this again" }) as HTMLInputElement).checked).toBe(true)
        expect(interactionMocks.teamPut).not.toHaveBeenCalled()
      })
    }
  }
})
