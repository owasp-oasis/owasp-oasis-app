/**
 * BodyTab — renders the PR body as formatted markdown.
 * No external library — covers the patterns in OASIS PR bodies:
 *   headings (##, ###, ####), code fences, inline code, bold, italic,
 *   links, unordered/ordered lists, blockquotes, tables, paragraphs.
 */
import type { ReactNode } from 'react'

interface Props {
  body: string | null
  loading: boolean
  error: string | null
}

/* ── Inline renderer ────────────────────────────────────────── */
function renderInline(text: string, key?: string): ReactNode {
  // Process inline tokens: **bold**, *italic*, `code`, [label](url)
  const parts: ReactNode[] = []
  let remaining = text
  let i = 0

  const patterns: [RegExp, (m: RegExpExecArray) => ReactNode][] = [
    [/\*\*(.+?)\*\*/,          (m) => <strong key={`b${i++}`}>{m[1]}</strong>],
    [/__(.+?)__/,              (m) => <strong key={`b${i++}`}>{m[1]}</strong>],
    [/\*(.+?)\*/,              (m) => <em key={`e${i++}`}>{m[1]}</em>],
    [/_(.+?)_/,                (m) => <em key={`e${i++}`}>{m[1]}</em>],
    [/`([^`]+)`/,              (m) => <code key={`c${i++}`} className="prp-md-inline-code">{m[1]}</code>],
    [/\[([^\]]+)\]\(([^)]+)\)/, (m) => <a key={`a${i++}`} href={m[2]} target="_blank" rel="noopener noreferrer" className="prp-md-link">{m[1]}</a>],
  ]

  while (remaining.length > 0) {
    let earliest: { index: number; length: number; node: ReactNode } | null = null

    for (const [re, render] of patterns) {
      const match = re.exec(remaining)
      if (match && (earliest === null || match.index < earliest.index)) {
        earliest = { index: match.index, length: match[0].length, node: render(match) }
      }
    }

    if (!earliest) {
      parts.push(remaining)
      break
    }

    if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index))
    parts.push(earliest.node)
    remaining = remaining.slice(earliest.index + earliest.length)
  }

  return <span key={key}>{parts}</span>
}

/* ── Table renderer ─────────────────────────────────────────── */
function renderTable(rows: string[], startKey: number): ReactNode {
  const cells = rows.map(r =>
    r.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
  )
  const header = cells[0]
  // Row index 1 is the separator (---)
  const body   = cells.slice(2)
  return (
    <table key={`tbl${startKey}`} className="prp-md-table">
      <thead>
        <tr>
          {header.map((h, i) => <th key={i} className="prp-md-th">{renderInline(h)}</th>)}
        </tr>
      </thead>
      <tbody>
        {body.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => <td key={ci} className="prp-md-td">{renderInline(cell)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Block renderer ─────────────────────────────────────────── */
function renderMarkdown(body: string): ReactNode[] {
  const lines   = body.split('\n')
  const nodes:  ReactNode[] = []
  let   k       = 0            // key counter

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (line.match(/^```/)) {
      const lang  = line.slice(3).trim()
      const start = i + 1
      let   end   = start
      while (end < lines.length && !lines[end].match(/^```/)) end++
      const code = lines.slice(start, end).join('\n')
      nodes.push(
        <pre key={k++} className="prp-md-pre">
          <code className={`prp-md-code-block${lang ? ` language-${lang}` : ''}`}>{code}</code>
        </pre>
      )
      i = end + 1
      continue
    }

    // Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text  = headingMatch[2]
      const cls   = level <= 2 ? 'prp-md-h2' : level === 3 ? 'prp-md-h3' : 'prp-md-h4'
      nodes.push(<p key={k++} className={cls}>{renderInline(text)}</p>)
      i++
      continue
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <blockquote key={k++} className="prp-md-blockquote">
          {quoteLines.map((ql, qi) => <span key={qi}>{renderInline(ql)}{qi < quoteLines.length - 1 ? <br /> : null}</span>)}
        </blockquote>
      )
      continue
    }

    // Table (row starts with |)
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) {
        nodes.push(renderTable(tableLines, k++))
      }
      continue
    }

    // Unordered list
    if (line.match(/^[*\-+]\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^[*\-+]\s/)) {
        items.push(lines[i].replace(/^[*\-+]\s/, ''))
        i++
      }
      nodes.push(
        <ul key={k++} className="prp-md-ul">
          {items.map((item, ii) => <li key={ii} className="prp-md-li">{renderInline(item)}</li>)}
        </ul>
      )
      continue
    }

    // Ordered list
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = []
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''))
        i++
      }
      nodes.push(
        <ol key={k++} className="prp-md-ol">
          {items.map((item, ii) => <li key={ii} className="prp-md-li">{renderInline(item)}</li>)}
        </ol>
      )
      continue
    }

    // Horizontal rule
    if (line.match(/^(-{3,}|_{3,}|\*{3,})$/)) {
      nodes.push(<hr key={k++} style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '14px 0' }} />)
      i++
      continue
    }

    // Blank line — skip
    if (line.trim() === '') {
      i++
      continue
    }

    // Paragraph — accumulate consecutive non-empty, non-special lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^(#{1,4}\s|```|> |[*\-+]\s|\d+\.\s|\|)/) &&
      !lines[i].match(/^(-{3,}|_{3,}|\*{3,})$/)
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      nodes.push(
        <p key={k++} className="prp-md-p">
          {paraLines.map((pl, pi) => (
            <span key={pi}>
              {renderInline(pl)}
              {pi < paraLines.length - 1 ? <br /> : null}
            </span>
          ))}
        </p>
      )
    }
  }

  return nodes
}

/* ── Component ──────────────────────────────────────────────── */
export default function BodyTab({ body, loading, error }: Props) {
  if (loading) return <div className="prp-loading">Loading PR body…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!body)   return <p className="prp-no-data">No description provided.</p>

  return <div className="prp-md">{renderMarkdown(body)}</div>
}
