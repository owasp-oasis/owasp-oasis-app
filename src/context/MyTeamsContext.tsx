import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { emptyMyTeams, errorMessage, teamGet, type MyTeams } from '../pages/workspace/teamApi'
import { highestPendingInviteId, hasUndismissedInvites } from '../lib/teamInvitationDismissal'

const dismissalKey = 'oasis-team-invitations-dismissed'
function scopedDismissalKey(sessionScope: string): string {
  return `${dismissalKey}:${sessionScope}`
}
function readDismissal(sessionScope?: string): number | null {
  if (!sessionScope) return null
  try {
    const value = Number(localStorage.getItem(scopedDismissalKey(sessionScope)))
    return Number.isSafeInteger(value) && value > 0 ? value : null
  } catch { return null }
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
  const [dismissedThroughInviteId, setDismissedThroughInviteId] = useState<number | null>(null)
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
    setDismissedThroughInviteId(readDismissal(mine.notification_session))
  }, [mine.notification_session])

  useEffect(() => {
    void refresh()
    // Reconcile invites handled in another tab without background polling.
    const onFocus = () => { void refresh() }
    const onStorage = (event: StorageEvent) => {
      const key = mine.notification_session ? scopedDismissalKey(mine.notification_session) : null
      if (event.key === key || event.key === null) {
        setDismissedThroughInviteId(readDismissal(mine.notification_session))
      }
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      pending.current?.abort()
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [mine.notification_session, refresh])

  const dismiss = () => {
    const sessionScope = mine.notification_session
    const inviteId = highestPendingInviteId(mine.invites)
    if (!sessionScope || inviteId === null) return
    setDismissedThroughInviteId(inviteId)
    // Scope the numeric watermark to a non-authenticating session digest.
    try { localStorage.setItem(scopedDismissalKey(sessionScope), String(inviteId)) } catch { /* In-memory dismissal still works. */ }
  }
  return <MyTeamsContext.Provider value={{ mine, loading, error, refresh, dismiss, dismissed: !hasUndismissedInvites(mine.invites, dismissedThroughInviteId) }}>
    {children}
  </MyTeamsContext.Provider>
}

export function useMyTeams() { return useContext(MyTeamsContext) }
