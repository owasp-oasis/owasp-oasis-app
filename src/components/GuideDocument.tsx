import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './GuideDocument.css'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const token = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0

  while ((match = token.exec(text))) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index))
    const key = `${keyPrefix}-${index++}`
    if (match[2] && match[3]) {
      const href = match[3].trim()
      if (href.startsWith('/') && !href.startsWith('//')) {
        nodes.push(<Link key={key} to={href}>{match[2]}</Link>)
      } else if (/^https?:\/\//i.test(href)) {
        nodes.push(<a key={key} href={href} target="_blank" rel="noopener noreferrer">{match[2]}</a>)
      } else {
        nodes.push(match[2])
      }
    } else if (match[4]) {
      nodes.push(<strong key={key}>{match[4]}</strong>)
    } else if (match[5]) {
      nodes.push(<code key={key}>{match[5]}</code>)
    }
    cursor = match.index + match[0].length
  }

  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

export function renderGuideMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.trim().split('\n')
  const nodes: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i].trimEnd()
    if (!line.trim()) { i++; continue }

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const content = renderInline(heading[2], `heading-${i}`)
      const key = `block-${i++}`
      if (level === 1) nodes.push(<h1 key={key}>{content}</h1>)
      else if (level === 2) nodes.push(<h2 key={key}>{content}</h2>)
      else if (level === 3) nodes.push(<h3 key={key}>{content}</h3>)
      else nodes.push(<h4 key={key}>{content}</h4>)
      continue
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/)
    if (unordered) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i++
      }
      nodes.push(<ul key={`block-${i - items.length}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `list-${i}-${itemIndex}`)}</li>)}</ul>)
      continue
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/)
    if (ordered) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      nodes.push(<ol key={`block-${i - items.length}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item, `step-${i}-${itemIndex}`)}</li>)}</ol>)
      continue
    }

    const paragraph: string[] = []
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,4}\s|[-*+]\s|\d+\.\s)/.test(lines[i])) {
      paragraph.push(lines[i].trim())
      i++
    }
    nodes.push(<p key={`block-${i - paragraph.length}`}>{renderInline(paragraph.join(' '), `paragraph-${i}`)}</p>)
  }

  return nodes
}

interface Props {
  active: 'quick-start' | 'reviewer-guide' | 'worked-example'
  markdown: string
}

const guideLinks = [
  { id: 'quick-start', label: 'Quick Start', href: '/quick-start' },
  { id: 'reviewer-guide', label: 'Reviewer Guide', href: '/reviewer-guide' },
  { id: 'worked-example', label: 'Worked Example', href: '/worked-example' },
] as const

export default function GuideDocument({ active, markdown }: Props) {
  return <div className="guide-page">
    <div className="guide-container">
      <nav className="guide-nav" aria-label="Reviewer guides">
        {guideLinks.map(guide => <Link key={guide.id} to={guide.href} aria-current={active === guide.id ? 'page' : undefined}>{guide.label}</Link>)}
      </nav>
      <article className="guide-content">{renderGuideMarkdown(markdown)}</article>
      <nav className="guide-next" aria-label="Continue reviewing">
        {active === 'quick-start'
          ? <Link to="/reviewer-guide"><span>Next</span><strong>Read the Reviewer Guide</strong></Link>
          : active === 'reviewer-guide'
            ? <Link to="/worked-example"><span>Next</span><strong>Read the Worked Example</strong></Link>
            : <Link to="/reviewer-guide"><span>Back</span><strong>Reviewer Guide</strong></Link>}
        <Link className="guide-browse" to="/workspace/fixes">Browse Candidate Fixes</Link>
      </nav>
    </div>
  </div>
}
