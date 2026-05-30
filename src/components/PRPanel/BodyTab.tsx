/**
 * BodyTab — shows the full PR body text with ## headings rendered as bold dividers.
 * Details data is fetched by PRPanel and passed as a prop.
 */
interface Props {
  body: string | null
  loading: boolean
  error: string | null
}

export default function BodyTab({ body, loading, error }: Props) {
  if (loading) return <div className="prp-loading">Loading PR body…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!body)   return <p className="prp-no-data">No description provided.</p>

  // Render ## headings as bold section dividers, rest as plain pre-wrap text
  const lines = body.split('\n')

  return (
    <pre className="prp-body-text">
      {lines.map((line, i) => {
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
        if (headingMatch) {
          return (
            <strong key={i} className="prp-section-header">
              {headingMatch[2]}
            </strong>
          )
        }
        return <span key={i}>{line}{'\n'}</span>
      })}
    </pre>
  )
}
