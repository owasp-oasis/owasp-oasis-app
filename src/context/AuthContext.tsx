import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface AuthUser {
  login: string
  avatar_url: string | null
  role: 'admin' | 'moderator' | 'member' | 'guest'
}

interface UserPreferences {
  languages: string[] | null
  severities: string[] | null
  experience: string | null
  onboarding_version: string | null
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  preferences: UserPreferences | null
  current_version: string | null
  logout: () => Promise<void>
  refetch: () => Promise<void>
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  preferences: null,
  current_version: null,
  logout: async () => {},
  refetch: async () => {},
  updatePreferences: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [preferences, setPreferences] = useState<UserPreferences | null>(null)
  const [current_version, setCurrentVersion] = useState<string | null>(null)

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json() as { ok: boolean; user: AuthUser | null }
        setUser(data.user)

        // If user is logged in, fetch their preferences
        if (data.user) {
          try {
            const prefRes = await fetch('/api/preferences/mine', { credentials: 'include' })
            if (prefRes.ok) {
              const prefData = await prefRes.json() as {
                preferences: UserPreferences
                current_version: string
              }
              setPreferences(prefData.preferences)
              setCurrentVersion(prefData.current_version)
            }
          } catch {
            // preferences fetch is optional, don't block on it
          }
        } else {
          setPreferences(null)
          setCurrentVersion(null)
        }
      } else {
        setUser(null)
        setPreferences(null)
        setCurrentVersion(null)
      }
    } catch {
      setUser(null)
      setPreferences(null)
      setCurrentVersion(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMe() }, [fetchMe])

  const logout = useCallback(async () => {
    try {
      // Fetch a fresh CSRF token
      const csrfRes = await fetch('/api/csrf', { credentials: 'include' })
      const csrfData = await csrfRes.json() as { token: string }
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrfData.token },
      })
    } catch { /* non-fatal */ }
    setUser(null)
    setPreferences(null)
    setCurrentVersion(null)
  }, [])

  const updatePreferences = useCallback(async (newPrefs: Partial<UserPreferences>) => {
    try {
      const res = await fetch('/api/preferences/mine', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newPrefs),
      })
      if (res.ok) {
        const data = await res.json() as { preferences: UserPreferences }
        setPreferences(data.preferences)
      }
    } catch { /* non-fatal */ }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, preferences, current_version, logout, refetch: fetchMe, updatePreferences }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
