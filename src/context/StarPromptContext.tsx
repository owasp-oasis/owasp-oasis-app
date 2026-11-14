/**
 * StarPromptContext — asks signed-in users to star the OASIS repositories.
 *
 * Stars are only ever created by the user clicking the "Star" button
 * (POST /api/github/stars). Nothing here stars automatically.
 *
 * Prompt moments:
 *  - once per browser session after sign-in, if any repo is unstarred
 *  - after a vote or comment is posted (remind('vote' | 'comment')), until the
 *    user dismisses the popup; after that, not again this browser session
 *  - inline after mailing-list signup (<StarCallout />)
 *
 * Other onboarding popups call useHoldStarPrompt(open) so the two never stack:
 * while any hold is active the star popup stays closed, and a prompt that
 * would have opened then is skipped rather than queued.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import StarPromptModal from '../components/StarPrompt/StarPromptModal'

export const STAR_REPOS = ['OWASP/oasis', 'owasp-oasis/project-overview'] as const

export interface StarRepoState { full_name: string; starred: boolean }
export type StarReason = 'signin' | 'vote' | 'comment'

interface StarPromptValue {
  /** null while unknown (signed out, loading, or GitHub unreachable). */
  repos: StarRepoState[] | null
  allStarred: boolean
  starring: boolean
  error: string | null
  starAll: () => Promise<boolean>
  /** Open the popup if the user is signed in and has not starred every repo. */
  remind: (reason: StarReason) => void
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
  hold: () => {},
})

const SHOWN_KEY = 'oasis:star-prompt-shown'
const DISMISSED_KEY = 'oasis:star-prompt-dismissed'

function sessionFlag(name: string, login: string, set?: boolean): boolean {
  try {
    const key = `${name}:${login}`
    if (set) sessionStorage.setItem(key, '1')
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function StarPromptProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const login = user?.login ?? null
  const [repos, setRepos] = useState<StarRepoState[] | null>(null)
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

  const loadStatus = useCallback((force = false): Promise<StarRepoState[] | null> => {
    if (!force && statusRef.current) return statusRef.current
    const p = fetch('/api/github/stars', { credentials: 'include' })
      .then(async res => {
        if (!res.ok) return null
        const data = await res.json() as { repos?: StarRepoState[] }
        return data.repos ?? null
      })
      .catch(() => null)
      .then(next => { setRepos(next); return next })
    statusRef.current = p
    return p
  }, [])

  // Reset on account change; prompt once per browser session after sign-in.
  useEffect(() => {
    statusRef.current = null
    setRepos(null)
    setOpen(false)
    setError(null)
    if (!login) return
    void loadStatus().then(next => {
      if (heldRef.current) return
      if (next && next.some(r => !r.starred) && !sessionFlag(SHOWN_KEY, login)) {
        sessionFlag(SHOWN_KEY, login, true)
        setReason('signin')
        setOpen(true)
      }
    })
  }, [login, loadStatus])

  const remind = useCallback((why: StarReason) => {
    if (!login || sessionFlag(DISMISSED_KEY, login)) return
    void loadStatus().then(next => {
      if (heldRef.current || sessionFlag(DISMISSED_KEY, login)) return
      if (next && next.some(r => !r.starred)) {
        setReason(why)
        setError(null)
        setOpen(true)
      }
    })
  }, [login, loadStatus])

  const starAll = useCallback(async (): Promise<boolean> => {
    setStarring(true)
    setError(null)
    try {
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
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
      if (res.status === 401 || res.status === 403) {
        setError('Your GitHub session has expired. Sign in again to star.')
        return false
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'GitHub did not accept the star. Please try again.')
        return false
      }
      return true
    } catch {
      setError('Could not reach GitHub. Check your connection and try again.')
      return false
    } finally {
      setStarring(false)
    }
  }, [])

  const dismiss = useCallback(() => {
    if (login) sessionFlag(DISMISSED_KEY, login, true)
    setOpen(false)
  }, [login])

  const allStarred = !!repos && repos.every(r => r.starred)

  return (
    <StarPromptContext.Provider value={{ repos, allStarred, starring, error, starAll, remind, hold }}>
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
 * another onboarding popup. Releases the hold on unmount.
 */
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
