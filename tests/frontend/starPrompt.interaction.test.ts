// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PROMPT_COOLDOWN_MS,
  PROMPT_MEMORY_KEY,
  StarPromptProvider,
  useHoldStarPrompt,
  useStarPrompt,
} from '../../src/context/StarPromptContext'

const mocks = vi.hoisted(() => ({
  user: { login: 'reviewer' } as null | { login: string },
  starred: false,
  statusFails: 0,
}))

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}))

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input)
  if (url.endsWith('/api/github/stars') && mocks.statusFails > 0) {
    mocks.statusFails--
    return new Response(JSON.stringify({ ok: false, error: 'GitHub unavailable' }), { status: 502 })
  }
  const repos = ['OWASP/oasis', 'owasp-oasis/project-overview']
    .map(full_name => ({ full_name, starred: mocks.starred }))
  return new Response(JSON.stringify({ ok: true, repos, all_starred: mocks.starred }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

/** In-memory Storage: Node 25+ shadows jsdom's localStorage with its own, which is undefined without a storage file. */
function memoryStorage(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    clear: () => items.clear(),
    getItem: key => items.get(key) ?? null,
    key: index => [...items.keys()][index] ?? null,
    removeItem: key => { items.delete(key) },
    setItem: (key, value) => { items.set(key, String(value)) },
  }
}

const statusCalls = () => fetchMock.mock.calls.filter(([input]) => String(input).endsWith('/api/github/stars')).length
const memoryKey = `${PROMPT_MEMORY_KEY}:reviewer`
const setMemory = (memory: Record<string, number>) => localStorage.setItem(memoryKey, JSON.stringify(memory))
const memory = () => JSON.parse(localStorage.getItem(memoryKey) ?? '{}') as Record<string, number>

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

/** A fresh tab: same localStorage, new page state. */
async function reopenTab() {
  cleanup()
  renderApp()
  await act(async () => {})
}

const starDialog = () => screen.queryByRole('dialog')
const settle = () => act(async () => {})

beforeEach(() => {
  mocks.user = { login: 'reviewer' }
  mocks.starred = false
  mocks.statusFails = 0
  vi.stubGlobal('localStorage', memoryStorage())
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('star prompt', () => {
  it('opens after sign-in when a repository is unstarred', async () => {
    renderApp()
    expect(await screen.findByRole('dialog', { name: 'Help OASIS grow with a star' })).toBeTruthy()
    expect(memory().promptedAt).toEqual(expect.any(Number))
  })

  it('shows the sign-in prompt once across tabs, without re-checking GitHub', async () => {
    renderApp()
    await screen.findByRole('dialog')
    const calls = statusCalls()

    await reopenTab()
    expect(starDialog()).toBeNull()
    expect(statusCalls()).toBe(calls)
  })

  it('offers the sign-in prompt again after the cooldown', async () => {
    setMemory({ promptedAt: Date.now() - PROMPT_COOLDOWN_MS - 1000 })
    renderApp()
    expect(await screen.findByRole('dialog', { name: 'Help OASIS grow with a star' })).toBeTruthy()
  })

  it('remembers a dismissal across tabs and stops vote reminders', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Not now' }))
    expect(starDialog()).toBeNull()
    expect(memory().dismissedAt).toEqual(expect.any(Number))

    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    await settle()
    expect(starDialog()).toBeNull()

    await reopenTab()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Submit vote' }))
    await settle()
    expect(starDialog()).toBeNull()
  })

  it('shows the vote reminder when the sign-in prompt was shown but not dismissed', async () => {
    const user = userEvent.setup()
    setMemory({ promptedAt: Date.now() })
    renderApp()
    await settle()
    expect(starDialog()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    expect(await screen.findByRole('dialog', { name: 'Thanks for your vote!' })).toBeTruthy()
  })

  it('remembers a fully starred account and stops asking GitHub', async () => {
    const user = userEvent.setup()
    mocks.starred = true
    renderApp()
    await settle()
    expect(starDialog()).toBeNull()
    expect(memory().allStarredAt).toEqual(expect.any(Number))

    await reopenTab()
    const calls = statusCalls()
    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    await settle()
    expect(starDialog()).toBeNull()
    expect(statusCalls()).toBe(calls)
  })

  it('retries a failed status lookup instead of caching the failure', async () => {
    const user = userEvent.setup()
    mocks.statusFails = 1
    renderApp()
    await settle()
    expect(starDialog()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    expect(await screen.findByRole('dialog', { name: 'Thanks for your vote!' })).toBeTruthy()
    expect(statusCalls()).toBe(2)
  })

  it('owns Escape and other keys so the page behind does not react', async () => {
    const user = userEvent.setup()
    const pageKeys: string[] = []
    const onPageKey = (e: KeyboardEvent) => { pageKeys.push(e.key) }
    document.addEventListener('keydown', onPageKey)
    try {
      setMemory({ promptedAt: Date.now() })
      renderApp()
      await settle()
      const voteButton = screen.getByRole('button', { name: 'Submit vote' })
      await user.click(voteButton)
      await screen.findByRole('dialog')

      await user.keyboard('{ArrowDown}')
      expect(starDialog()).not.toBeNull()
      await user.keyboard('{Escape}')
      expect(starDialog()).toBeNull()
      expect(pageKeys).toEqual([])
      expect(document.activeElement).toBe(voteButton)
    } finally {
      document.removeEventListener('keydown', onPageKey)
    }
  })

  it('keeps Tab focus inside the popup', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await screen.findByRole('dialog')
    for (let i = 0; i < 8; i++) {
      await user.tab()
      expect(dialog.contains(document.activeElement)).toBe(true)
    }
    await user.tab({ shift: true })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('skips the sign-in prompt while another popup is open', async () => {
    const user = userEvent.setup()
    renderApp(true)
    await settle()
    expect(starDialog()).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Close other popup' }))
    await settle()
    expect(starDialog()).toBeNull()
  })

  it('steps aside when another popup opens on top of it', async () => {
    const user = userEvent.setup()
    renderApp()
    await screen.findByRole('dialog')

    await user.click(screen.getByRole('button', { name: 'Open other popup' }))
    await waitFor(() => expect(starDialog()).toBeNull())

    await user.click(screen.getByRole('button', { name: 'Close other popup' }))
    await settle()
    expect(starDialog()).toBeNull()
  })

  it('does not open a vote reminder while another popup is open', async () => {
    const user = userEvent.setup()
    setMemory({ promptedAt: Date.now() })
    renderApp(true)
    await settle()
    await user.click(screen.getByRole('button', { name: 'Submit vote' }))
    await settle()
    expect(starDialog()).toBeNull()
  })
})
