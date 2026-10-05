import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { WORKSPACE_DEFAULTS, type WorkspacePreferences } from '../workspacePreferences'
import { teamGet, teamPut, errorMessage } from '../pages/workspace/teamApi'

const Context = createContext({
  preferences: WORKSPACE_DEFAULTS,
  loading: false,
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
    if (!user) { setLoading(false); return }
    setLoading(true)
    void teamGet<{ preferences: WorkspacePreferences }>('/api/preferences/workspace', controller.signal)
      .then(data => setPreferences({ ...WORKSPACE_DEFAULTS, ...data.preferences }))
      .catch(e => { if (!controller.signal.aborted) setError(errorMessage(e)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
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
  return <Context.Provider value={{ preferences, loading, saving, error, save, retry: () => setRetryId(id => id + 1), notify }}>{children}{toast && <div className="ws-toast" role="status" key={toast}>{toast}</div>}</Context.Provider>
}
export const useWorkspace = () => useContext(Context)
