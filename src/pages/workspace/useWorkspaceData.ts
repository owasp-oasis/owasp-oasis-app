import { useCallback, useEffect, useState } from 'react'
/** Abort obsolete requests on tab changes and expose a real retry, not a no-op. */
export function useWorkspaceData<T>(path: string | null, initial: T) {
  const [state, setState] = useState({ path, data: initial, loading: !!path, error: null as string | null })
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(n => n + 1), [])
  useEffect(() => {
    if (!path) { setState({ path, data: initial, loading: false, error: null }); return }
    const controller = new AbortController()
    setState({ path, data: initial, loading: true, error: null })
    void fetch(path, { signal: controller.signal, credentials: 'include', cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error('Could not load this view. Please try again.'); return res.json() as Promise<T> })
      .then(data => setState({ path, data, loading: false, error: null }))
      .catch(e => { if (!controller.signal.aborted) setState({ path, data: initial, loading: false, error: String(e.message) }) })
    return () => controller.abort()
    // Initial is the empty fallback, not a request dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, revision])
  // Route changes reuse the same hook position. Do not expose the previous
  // screen's differently shaped payload during the render before this effect
  // installs the new request state.
  const current = state.path === path
  return { ...state, data: current ? state.data : initial, loading: !current || state.loading, retry }
}
