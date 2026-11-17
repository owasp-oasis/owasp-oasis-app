/**
 * StarPromptContext — asks signed-in users to star the OASIS repositories.
 *
 * Stars are only ever created by the user clicking the "Star" button
 * (POST /api/github/stars). Nothing here stars automatically.
 *
 * Prompt moments:
 *  - after sign-in, at most once per PROMPT_COOLDOWN_MS (the 7-day session
 *    lifetime), if any repo is unstarred
 *  - after a vote or comment is posted (remind('vote' | 'comment')), until the
 *    user dismisses the popup; after that, not again for PROMPT_COOLDOWN_MS
 *  - inline after mailing-list signup (<StarCallout />)
 *
 * What was shown, dismissed, or found fully starred is remembered per GitHub
 * login in localStorage, so it holds across tabs and reloads. When nothing
 * could be shown, the GitHub status lookup is skipped entirely.
 *
 * Other popups call useHoldStarPrompt(open) so the two never stack: while any
 * hold is active the star popup stays closed, and a prompt that would have
 * opened then is skipped rather than queued.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import StarPromptModal from '../components/StarPrompt/StarPromptModal'

export interface StarRepoState { full_name: string; starred: boolean }
export type StarReason = 'signin' | 'vote' | 'comment'

interface StarPromptValue {
  /** null while unknown (signed out, not loaded, or GitHub unreachable). */
  repos: StarRepoState[] | null
  allStarred: boolean
  starring: boolean
  error: string | null
  starAll: () => Promise<boolean>
  /** Open the popup if the user is signed in and has not starred every repo. */
  remind: (reason: StarReason) => void
  /** Load star status for inline UI (no popup). */
  checkStatus: () => void
  /** Internal: register or release a hold. Use useHoldStarPrompt() instead. */
  hold: (id: symbol, active: boolean) => void
}

const StarPromptContext = createContext<StarPromptValue>({
  repos: null,
  allStarred: false,
  starring: false,
  error: null,
  starAll: async () => false,
  remind: () => {},
  checkStatus: () => {},
  hold: () => {},
})

const DAY_MS = 24 * 60 * 60 * 1000
/** Quiet period after the popup is shown or dismissed; matches the session lifetime. */
export const PROMPT_COOLDOWN_MS = 7 * DAY_MS
/** How long a fully-starred result is trusted before GitHub is asked again. */
export const STARRED_RECHECK_MS = 30 * DAY_MS
export const PROMPT_MEMORY_KEY = 'oasis:star-prompt'

interface PromptMemory { promptedAt?: number; dismissedAt?: number; allStarredAt?: number }

function readMemory(login: string): PromptMemory {
  try {
    const raw = JSON.parse(localStorage.getItem(`${PROMPT_MEMORY_KEY}:${login}`) ?? '{}') as Record<string, unknown>
    const memory: PromptMemory = {}
    for (const key of ['promptedAt', 'dismissedAt', 'allStarredAt'] as const) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) memory[key] = raw[key] as number
    }
    return memory
  } catch {
    return {}
  }
}

function writeMemory(login: string, patch: PromptMemory): void {
  try {
    localStorage.setItem(`${PROMPT_MEMORY_KEY}:${login}`, JSON.stringify({ ...readMemory(login), ...patch }))
  } catch { /* storage unavailable: prompts fall back to once per page load */ }
}

function within(at: number | undefined, windowMs: number): boolean {
  if (at === undefined) return false
  const age = Date.now() - at
  return age >= 0 && age < windowMs
}

const knownStarred = (m: PromptMemory) => within(m.allStarredAt, STARRED_RECHECK_MS)
const signinQuiet = (m: PromptMemory) =>
  knownStarred(m) || within(m.promptedAt, PROMPT_COOLDOWN_MS) || within(m.dismissedAt, PROMPT_COOLDOWN_MS)
const reminderQuiet = (m: PromptMemory) => knownStarred(m) || within(m.dismissedAt, PROMPT_COOLDOWN_MS)

export function StarPromptProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const login = user?.login ?? null
  const [repos, setRepos] = useState<StarRepoState[] | null>(null)
  const [starredKnown, setStarredKnown] = useState(false)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<StarReason>('signin')
  const [starring, setStarring] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const statusRef = useRef<Promise<StarRepoState[] | null> | null>(null)
  const [holders, setHolders] = useState<ReadonlySet<symbol>>(() => new Set())
  const held = holders.size > 0
  const heldRef = useRef(held)
  heldRef.current = held

  const hold = useCallback((id: symbol, active: boolean) => {
    setHolders(prev => {
      if (prev.has(id) === active) return prev
      const next = new Set(prev)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  // Another popup took the screen: step aside instead of stacking on it.
  useEffect(() => {
    if (held) setOpen(false)
  }, [held])

  const loadStatus = useCallback((who: string): Promise<StarRepoState[] | null> => {
    if (statusRef.current) return statusRef.current
    const p = fetch('/api/github/stars', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) return null
        const data = await res.json() as { repos?: StarRepoState[] }
        return data.repos ?? null
      })
      .catch(() => null)
      .then(next => {
        // Retry a failed lookup next time instead of caching the failure.
        if (!next && statusRef.current === p) statusRef.current = null
        if (next?.every(r => r.starred)) {
          writeMemory(who, { allStarredAt: Date.now() })
          setStarredKnown(true)
        }
        setRepos(next)
        return next
      })
    statusRef.current = p
    return p
  }, [])

  // Reset on account change; offer the popup after sign-in unless recently shown.
  useEffect(() => {
    statusRef.current = null
    setRepos(null)
    setOpen(false)
    setError(null)
    setStarredKnown(login ? knownStarred(readMemory(login)) : false)
    if (!login || signinQuiet(readMemory(login))) return
    let cancelled = false
    void loadStatus(login).then(next => {
      if (cancelled || heldRef.current || signinQuiet(readMemory(login))) return
      if (next && next.some(r => !r.starred)) {
        writeMemory(login, { promptedAt: Date.now() })
        setReason('signin')
        setOpen(true)
      }
    })
    return () => { cancelled = true }
  }, [login, loadStatus])

  const remind = useCallback((why: StarReason) => {
    if (!login || reminderQuiet(readMemory(login))) return
    void loadStatus(login).then(next => {
      if (heldRef.current || reminderQuiet(readMemory(login))) return
      if (next && next.some(r => !r.starred)) {
        setReason(why)
        setError(null)
        setOpen(true)
      }
    })
  }, [login, loadStatus])

  const checkStatus = useCallback(() => {
    if (login && !knownStarred(readMemory(login))) void loadStatus(login)
  }, [login, loadStatus])

  const starAll = useCallback(async (): Promise<boolean> => {
    setStarring(true)
    setError(null)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      if (!csrfRes.ok) throw new Error('csrf')
      const { token } = await csrfRes.json() as { token: string }
      const res = await fetch('/api/github/stars', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': token },
      })
      const data = await res.json() as { ok: boolean; error?: string; repos?: StarRepoState[] }
      if (data.repos) {
        setRepos(data.repos)
        statusRef.current = Promise.resolve(data.repos)
      }
      if (res.status === 401) {
        setError(data.error ?? 'Your sign-in has expired. Sign in again to star.')
        return false
      }
      if (res.status === 403 && /security token/i.test(data.error ?? '')) {
        setError('This page is out of date. Refresh it and try again.')
        return false
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'GitHub did not accept the star. Please try again.')
        return false
      }
      if (login) writeMemory(login, { allStarredAt: Date.now() })
      setStarredKnown(true)
      return true
    } catch {
      setError('Could not reach GitHub. Check your connection and try again.')
      return false
    } finally {
      setStarring(false)
    }
  }, [login])

  const dismiss = useCallback(() => {
    if (login) writeMemory(login, { dismissedAt: Date.now() })
    setOpen(false)
  }, [login])

  const allStarred = repos ? repos.every(r => r.starred) : starredKnown

  return (
    <StarPromptContext.Provider value={{ repos, allStarred, starring, error, starAll, remind, checkStatus, hold }}>
      {children}
      {open && login && !held && (
        <StarPromptModal
          reason={reason}
          repos={repos}
          starring={starring}
          error={error}
          onStar={starAll}
          onClose={dismiss}
        />
      )}
    </StarPromptContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStarPrompt() {
  return useContext(StarPromptContext)
}

/**
 * Keep the star popup closed while `active` is true, so it never stacks on
 * another popup or shows where prompts don't belong. Releases on unmount.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useHoldStarPrompt(active: boolean) {
  const { hold } = useContext(StarPromptContext)
  const id = useRef<symbol | null>(null)
  if (!id.current) id.current = Symbol('star-prompt-hold')
  useEffect(() => {
    const key = id.current as symbol
    hold(key, active)
    return () => hold(key, false)
  }, [active, hold])
}
