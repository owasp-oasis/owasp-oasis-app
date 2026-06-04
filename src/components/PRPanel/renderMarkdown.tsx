/**
 * Shared markdown renderer for the PR Panel.
 * Used by BodyTab and CommentsTab.
 *
 * Handles: headings (##/###/####), fenced code (including mermaid),
 * blockquotes, tables, unordered/ordered lists, HR, paragraphs,
 * HTML <details>/<summary> blocks, and inline bold/italic/code/links.
 */
import type { ReactNode } from 'react'

/* ── Inline renderer ────────────────────────────────────────── */
export function renderInline(text: string, key?: string): ReactNode {
  const parts: ReactNode[] = []
  let remaining = text
  let i = 0

  const patterns: [RegExp, (m: RegExpExecArray) => ReactNode][] = [
    [/\*\*(.+?)\*\*/,            (m) => <strong key={`b${i++}`}>{m[1]}</strong>],
    [/__(.+?)__/,                (m) => <strong key={`b${i++}`}>{m[1]}</strong>],
    [/\*(.+?)\*/,                (m) => <em key={`e${i++}`}>{m[1]}</em>],
    [/_(.+?)_/,                  (m) => <em key={`e${i++}`}>{m[1]}</em>],
    [/`([^`]+)`/,                (m) => <code key={`c${i++}`} className="prp-md-inline-code">{m[1]}</code>],
    [/\[([^\]]+)\]\(([^)]+)\)/,  (m) => {
      // Only allow safe URL schemes; block javascript:, data:, vbscript:, etc.
      const rawHref = m[2].trim()
      const safeHref = /^(https?:\/\/|#)/i.test(rawHref) ? rawHref : '#'
      return <a key={`a${i++}`} href={safeHref} target="_blank" rel="noopener noreferrer" className="prp-md-link">{m[1]}</a>
    }],
  ]

  while (remaining.length > 0) {
    let earliest: { index: number; length: number; node: ReactNode } | null = null

    for (const [re, render] of patterns) {
      const match = re.exec(remaining)
      if (match && (earliest === null || match.index < earliest.index)) {
        earliest = { index: match.index, length: match[0].length, node: render(match) }
      }
    }

    if (!earliest) { parts.push(remaining); break }
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
  const body   = cells.slice(2) // index 1 is the separator row
  return (
    <table key={`tbl${startKey}`} className="prp-md-table">
      <thead>
        <tr>{header.map((h, i) => <th key={i} className="prp-md-th">{renderInline(h)}</th>)}</tr>
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
export function renderMarkdown(body: string): ReactNode[] {
  const lines  = body.split('\n')
  const nodes: ReactNode[] = []
  let   k      = 0

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // ── Fenced code block (``` or ```lang) ──────────────────────
    if (line.match(/^```/)) {
      const lang  = line.slice(3).trim().toLowerCase()
      const start = i + 1
      let   end   = start
      while (end < lines.length && !lines[end].match(/^```/)) end++
      const code = lines.slice(start, end).join('\n')

      if (lang === 'mermaid') {
        // Rendered client-side by mermaid.js — wrap in a sentinel div
        nodes.push(
          <div key={k++} className="prp-mermaid" data-mermaid="true">
            {code}
          </div>
        )
      } else {
        nodes.push(
          <pre key={k++} className="prp-md-pre">
            <code className={`prp-md-code-block${lang ? ` language-${lang}` : ''}`}>{code}</code>
          </pre>
        )
      }
      i = end + 1
      continue
    }

    // ── HTML <details>/<summary> block ──────────────────────────
    // Matches: <details> on its own line (with optional attributes)
    if (line.match(/^<details/i)) {
      // Consume until </details>
      const innerLines: string[] = []
      let summaryText = ''
      let j = i + 1
      while (j < lines.length && !lines[j].match(/^<\/details>/i)) {
        const summaryMatch = lines[j].match(/^<summary>(.*?)<\/summary>/i)
        if (summaryMatch) {
          summaryText = summaryMatch[1]
        } else {
          innerLines.push(lines[j])
        }
        j++
      }
      // Recursively render inner content (strip leading/trailing blank lines)
      const innerBody = innerLines.join('\n').trim()
      const innerNodes = innerBody ? renderMarkdown(innerBody) : []
      nodes.push(
        <details key={k++} className="prp-md-details">
          <summary className="prp-md-summary">{renderInline(summaryText)}</summary>
          <div className="prp-md-details-body">{innerNodes}</div>
        </details>
      )
      i = j + 1 // skip </details>
      continue
    }

    // ── Skip bare </details> lines (in case they appear without opener) ──
    if (line.match(/^<\/details>/i)) { i++; continue }

    // ── Heading ──────────────────────────────────────────────────
    const headingMatch = line.match(/^(#{1,4})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text  = headingMatch[2]
      const cls   = level <= 2 ? 'prp-md-h2' : level === 3 ? 'prp-md-h3' : 'prp-md-h4'
      nodes.push(<p key={k++} className={cls}>{renderInline(text)}</p>)
      i++
      continue
    }

    // ── Blockquote ───────────────────────────────────────────────
    if (line.startsWith('> ')) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2))
        i++
      }
      nodes.push(
        <blockquote key={k++} className="prp-md-blockquote">
          {quoteLines.map((ql, qi) => (
            <span key={qi}>{renderInline(ql)}{qi < quoteLines.length - 1 ? <br /> : null}</span>
          ))}
        </blockquote>
      )
      continue
    }

    // ── Table ────────────────────────────────────────────────────
    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i])
        i++
      }
      if (tableLines.length >= 2) nodes.push(renderTable(tableLines, k++))
      continue
    }

    // ── Unordered list ───────────────────────────────────────────
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

    // ── Ordered list ─────────────────────────────────────────────
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

    // ── Horizontal rule ──────────────────────────────────────────
    if (line.match(/^(-{3,}|_{3,}|\*{3,})$/)) {
      nodes.push(<hr key={k++} style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '14px 0' }} />)
      i++
      continue
    }

    // ── Blank line ───────────────────────────────────────────────
    if (line.trim() === '') { i++; continue }

    // ── Paragraph ────────────────────────────────────────────────
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^(#{1,4}\s|```|> |[*\-+]\s|\d+\.\s|\||<details|<\/details)/i) &&
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
