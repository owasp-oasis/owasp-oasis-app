/**
 * BodyTab — renders the PR body as formatted markdown.
 * Uses the shared renderMarkdown module. Mermaid diagrams are rendered
 * client-side via a dynamic import of the mermaid library.
 */
import { useEffect } from 'react'
import { renderMarkdown } from './renderMarkdown'

interface Props {
  body: string | null
  loading: boolean
  error: string | null
}

export default function BodyTab({ body, loading, error }: Props) {
  // Dynamically load and run mermaid for any .prp-mermaid blocks in the DOM
  useEffect(() => {
    if (!body) return
    const hasMermaid = body.includes('```mermaid')
    if (!hasMermaid) return

    let cancelled = false
    import('mermaid').then(mod => {
      if (cancelled) return
      const mermaid = mod.default
      mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' })
      mermaid.run({ querySelector: '.prp-mermaid' }).catch(() => {/* non-fatal */})
    }).catch(() => {/* non-fatal — mermaid load failure just leaves raw DSL visible */})

    return () => { cancelled = true }
  }, [body])

  if (loading) return <div className="prp-loading">Loading PR body…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!body)   return <p className="prp-no-data">No description provided.</p>

  return <div className="prp-md">{renderMarkdown(body)}</div>
}
