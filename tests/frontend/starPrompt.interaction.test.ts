// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StarPromptProvider, useHoldStarPrompt, useStarPrompt } from '../../src/context/StarPromptContext'

const mocks = vi.hoisted(() => ({
  user: { login: 'reviewer' } as null | { login: string },
  starred: false,
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}))

function statusResponse() {
  const repos = ['OWASP/oasis', 'owasp-oasis/project-overview']
    .map(full_name => ({ full_name, starred: mocks.starred }))
  return new Response(JSON.stringify({ ok: true, repos, all_starred: mocks.starred }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Stands in for another onboarding popup plus the vote/comment call sites. */
function Harness({ initiallyHeld = false }: { initiallyHeld?: boolean }) {
  const [held, setHeld] = useState(initiallyHeld)
  const { remind } = useStarPrompt()
  useHoldStarPrompt(held)
  return createElement('div', null,
    createElement('button', { type: 'button', onClick: () => setHeld(h => !h) }, held ? 'Close other popup' : 'Open other popup'),
    createElement('button', { type: 'button', onClick: () => remind('vote') }, 'Submit vote'),
  )
}

function renderApp(initiallyHeld = false) {
  return render(createElement(StarPromptProvider, null, createElement(Harness, { initiallyHeld })))
}

const starDialog = () => screen.queryByRole('dialog')

beforeEach(() => {
  mocks.user = { login: 'reviewer' }
  mocks.starred = false
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => statusResponse()))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('star prompt', () => {
  it('opens once after sign-in when a repository is unstarred', async () => {
    renderApp()
    expect(await screen.findByRole('dialog', { name: 'Help OASIS grow with a star' })).toBeTruthy()
  })

  it('reminds after a vote until the user dismisses it, then stays quiet for the session', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(starDialog()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    await act(async () => {})
    expect(starDialog()).toBeNull()

    cleanup()
    renderApp()
    await act(async () => {})
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit vote' }))
    await act(async () => {})
    expect(starDialog()).toBeNull()
  })

  it('shows the vote reminder when the sign-in prompt was not dismissed', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('oasis:star-prompt-shown:reviewer', '1')
    renderApp()
    await act(async () => {})
    expect(starDialog()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    expect(await screen.findByRole('dialog', { name: 'Thanks for your vote!' })).toBeTruthy()
  })

  it('skips the sign-in prompt while another onboarding popup is open', async () => {
    const user = userEvent.setup()
    renderApp(true)
    await act(async () => {})
    expect(starDialog()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Close other popup' }))
    await act(async () => {})
    expect(starDialog()).toBeNull()
  })

  it('steps aside when another onboarding popup opens on top of it', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Open other popup' }))
    await waitFor(() => expect(starDialog()).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Close other popup' }))
    await act(async () => {})
    expect(starDialog()).toBeNull()
  })

  it('does not open a vote reminder while another popup is open', async () => {
    const user = userEvent.setup()
    sessionStorage.setItem('oasis:star-prompt-shown:reviewer', '1')
    renderApp(true)
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    await act(async () => {})
    expect(starDialog()).toBeNull()
  })

  it('never prompts once both repositories are starred', async () => {
    const user = userEvent.setup()
    mocks.starred = true
    renderApp()
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    await act(async () => {})
    expect(starDialog()).toBeNull()
  })
})
