import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { emptyMyTeams, errorMessage, teamGet, type MyTeams } from '../pages/workspace/teamApi'

const dismissalKey = 'oasis-team-invitations-dismissed'
function readDismissal(): string | null {
  try { return localStorage.getItem(dismissalKey) } catch { return null }
}

interface MyTeamsValue {
  mine: MyTeams
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  dismissed: boolean
  dismiss: () => void
}
const MyTeamsContext = createContext<MyTeamsValue>({
  mine: emptyMyTeams, loading: false, error: null, refresh: async () => {}, dismissed: false, dismiss: () => {},
})

export function MyTeamsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Reset private data synchronously when the signed-in account changes.
  return <SessionTeamsProvider key={user?.login ?? 'anonymous'} signedIn={!!user}>{children}</SessionTeamsProvider>
}

function SessionTeamsProvider({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  const [mine, setMine] = useState<MyTeams>(emptyMyTeams)
  const [loading, setLoading] = useState(signedIn)
  const [error, setError] = useState<string | null>(null)
  const [dismissedSession, setDismissedSession] = useState(readDismissal)
  const pending = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    if (!signedIn) return
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    try {
      const result = await teamGet<MyTeams>('/api/teams/mine', controller.signal)
      if (!controller.signal.aborted) { setMine(result); setError(null) }
    } catch (caught) {
      if (!controller.signal.aborted) { setMine(emptyMyTeams); setError(errorMessage(caught)) }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [signedIn])

  useEffect(() => {
    void refresh()
    // Reconcile invites handled in another tab without background polling.
    const onFocus = () => { void refresh() }
    const onStorage = (event: StorageEvent) => {
      if (event.key === dismissalKey || event.key === null) setDismissedSession(readDismissal())
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      pending.current?.abort()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  const dismiss = () => {
    if (!mine.notification_session) return
    setDismissedSession(mine.notification_session)
    // Store only a non-authenticating session digest, never invite data or credentials.
    try { localStorage.setItem(dismissalKey, mine.notification_session) } catch { /* In-memory dismissal still works. */ }
  }
  return <MyTeamsContext.Provider value={{ mine, loading, error, refresh, dismiss, dismissed: !!mine.notification_session && dismissedSession === mine.notification_session }}>
    {children}
  </MyTeamsContext.Provider>
}

export function useMyTeams() { return useContext(MyTeamsContext) }
