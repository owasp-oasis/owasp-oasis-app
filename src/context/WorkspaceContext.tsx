import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { WORKSPACE_DEFAULTS, type WorkspacePreferences } from '../workspacePreferences'
import { teamGet, teamPut, errorMessage } from '../pages/workspace/teamApi'

interface WorkspaceContextValue {
  preferences: WorkspacePreferences
  loading: boolean
  preferencesReady: boolean
  saving: boolean
  error: string | null
  save: (patch: Partial<WorkspacePreferences>) => Promise<void>
  retry: () => void
  notify: (message: string) => void
}

const Context = createContext<WorkspaceContextValue>({
  preferences: WORKSPACE_DEFAULTS,
  loading: false,
  preferencesReady: false,
  saving: false,
  error: null as string | null,
  save: async (_patch: Partial<WorkspacePreferences>) => {},
  retry: () => {},
  notify: (_message: string) => {},
})
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [preferences, setPreferences] = useState(WORKSPACE_DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadedLogin, setLoadedLogin] = useState<string | null>(null)
  const [loadFailedLogin, setLoadFailedLogin] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [retryId, setRetryId] = useState(0)
  const identity = useRef(user?.login)
  identity.current = user?.login
  const queue = useRef(Promise.resolve())
  const notify = useCallback((message: string) => setToast(message), [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const controller = new AbortController()
    setPreferences(WORKSPACE_DEFAULTS); setError(null)
    if (!user) { setLoading(false); setLoadedLogin(null); setLoadFailedLogin(null); return }
    const login = user.login
    setLoading(true)
    setLoadedLogin(null)
    setLoadFailedLogin(null)
    void teamGet<{ preferences: WorkspacePreferences }>('/api/preferences/workspace', controller.signal)
      .then(data => setPreferences({ ...WORKSPACE_DEFAULTS, ...data.preferences }))
      .catch(e => { if (!controller.signal.aborted) { setError(errorMessage(e)); setLoadFailedLogin(login) } })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setLoadedLogin(login) } })
    return () => controller.abort()
  }, [user?.login, retryId])
  const save = useCallback((patch: Partial<WorkspacePreferences>) => {
    const login = user?.login
    if (!login) return Promise.reject(new Error('Sign in to save preferences'))
    setSaving(true)
    const work = queue.current.catch(() => {}).then(async () => {
      if (identity.current !== login) return
      try {
        const result = await teamPut<{ preferences: WorkspacePreferences }>('/api/preferences/workspace', patch)
        if (identity.current !== login) return
        setPreferences(result.preferences); setError(null); notify('Preferences saved')
      } catch (e) { if (identity.current === login) setError(errorMessage(e)); throw e }
    })
    queue.current = work
    void work.finally(() => { if (queue.current === work) setSaving(false) }).catch(() => {})
    return work
  }, [user?.login, notify])
  return <Context.Provider value={{ preferences, loading, preferencesReady: !user || (loadedLogin === user.login && loadFailedLogin !== user.login), saving, error, save, retry: () => setRetryId(id => id + 1), notify }}>{children}{toast && <div className="ws-toast" role="status" key={toast}>{toast}</div>}</Context.Provider>
}
export const useWorkspace = () => useContext(Context)
