/**
 * ChangesTab — diff viewer for PR file changes.
 * Supports four view modes controlled by the parent panel:
 *   split          — side-by-side, line-level highlighting
 *   split+char     — side-by-side, intra-line character highlights on modified lines
 *   unified        — single-column git-diff style
 *   unified+char   — unified with intra-line character highlights
 *
 * Fetches /api/pr-panel/:id/files on first activation.
 */
import { useState, useEffect } from 'react'
import { diffChars } from 'diff'

export type DiffView = 'split' | 'unified'

interface FileEntry {
  filename: string
  status: string
  additions: number
  deletions: number
  changes: number
  patch: string | null
}

interface Props {
  prId: number
  diffView: DiffView
  charDiff: boolean
}

/* ── Diff row types ─────────────────────────────────────────── */
type DiffRow =
  | { type: 'hunk';    text: string }
  | { type: 'context'; leftNum: number; rightNum: number; text: string }
  | { type: 'del';     leftNum: number; text: string; pairId?: number }
  | { type: 'add';     rightNum: number; text: string; pairId?: number }

/** Parse a unified diff patch string into structured rows. */
function parseDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let leftLine  = 0
  let rightLine = 0

  const delBuf: { leftNum: number; text: string }[] = []

  function flushDels() {
    for (const d of delBuf) rows.push({ type: 'del', leftNum: d.leftNum, text: d.text })
    delBuf.length = 0
  }

  for (const raw of patch.split('\n')) {
    const hunkMatch = raw.match(/^@@[^@]*@@(.*)/)
    if (hunkMatch) {
      flushDels()
      const nums = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (nums) {
        leftLine  = parseInt(nums[1], 10)
        rightLine = parseInt(nums[2], 10)
      }
      rows.push({ type: 'hunk', text: raw })
      continue
    }

    if (raw.startsWith('-') && !raw.startsWith('---')) {
      flushDels()
      delBuf.push({ leftNum: leftLine, text: raw.slice(1) })
      leftLine++
      continue
    }

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      if (delBuf.length > 0) {
        const paired = delBuf.shift()!
        rows.push({ type: 'del', leftNum: paired.leftNum, text: paired.text })
        rows.push({ type: 'add', rightNum: rightLine, text: raw.slice(1) })
      } else {
        rows.push({ type: 'add', rightNum: rightLine, text: raw.slice(1) })
      }
      rightLine++
      continue
    }

    flushDels()
    if (!raw.startsWith('+++') && !raw.startsWith('---')) {
      rows.push({ type: 'context', leftNum: leftLine, rightNum: rightLine, text: raw.slice(1) })
      leftLine++
      rightLine++
    }
  }

  flushDels()
  return rows
}

/**
 * Tag adjacent del→add pairs with a shared pairId so we know which rows
 * to apply character-level diffs to. Mutates a copy of the rows array.
 */
function pairRows(rows: DiffRow[]): DiffRow[] {
  const result = rows.map(r => ({ ...r })) as DiffRow[]
  let pairCounter = 0
  for (let i = 0; i < result.length - 1; i++) {
    const curr = result[i]
    const next = result[i + 1]
    if (curr.type === 'del' && next.type === 'add') {
      pairCounter++
      ;(curr as Extract<DiffRow, { type: 'del' }>).pairId = pairCounter
      ;(next as Extract<DiffRow, { type: 'add' }>).pairId = pairCounter
      i++ // skip the add — it's already tagged
    }
  }
  return result
}

/* ── Character-diff span renderer ───────────────────────────── */
function CharSpans({
  oldText,
  newText,
  side,
}: {
  oldText: string
  newText: string
  side: 'del' | 'add'
}) {
  const parts = diffChars(oldText, newText)
  return (
    <>
      {parts.map((part, i) => {
        if (side === 'del') {
          if (part.added)   return null // not shown on del side
          if (part.removed) return <span key={i} className="prp-char-del">{part.value}</span>
          return <span key={i}>{part.value}</span>
        } else {
          if (part.removed) return null // not shown on add side
          if (part.added)   return <span key={i} className="prp-char-add">{part.value}</span>
          return <span key={i}>{part.value}</span>
        }
      })}
    </>
  )
}

/* ── Split (side-by-side) table ─────────────────────────────── */
function SplitDiffTable({ patch, charDiff }: { patch: string; charDiff: boolean }) {
  const rows = pairRows(parseDiff(patch))

  // Build a map from pairId → { delText, addText } for character diffing
  const pairs = new Map<number, { delText: string; addText: string }>()
  if (charDiff) {
    for (const row of rows) {
      if (row.type === 'del' && row.pairId !== undefined) {
        const existing = pairs.get(row.pairId)
        pairs.set(row.pairId, { delText: row.text, addText: existing?.addText ?? '' })
      }
      if (row.type === 'add' && row.pairId !== undefined) {
        const existing = pairs.get(row.pairId)
        pairs.set(row.pairId, { delText: existing?.delText ?? '', addText: row.text })
      }
    }
  }

  return (
    <div className="prp-diff-wrap">
      <table className="prp-diff-table">
        <tbody>
          {rows.map((row, i) => {
            if (row.type === 'hunk') {
              return (
                <tr key={i} className="prp-diff-hunk-row">
                  <td colSpan={5}>{row.text}</td>
                </tr>
              )
            }

            if (row.type === 'context') {
              return (
                <tr key={i}>
                  <td className="prp-diff-num">{row.leftNum}</td>
                  <td className="prp-diff-cell prp-diff-cell--ctx">{row.text}</td>
                  <td className="prp-diff-sep" />
                  <td className="prp-diff-num">{row.rightNum}</td>
                  <td className="prp-diff-cell prp-diff-cell--ctx">{row.text}</td>
                </tr>
              )
            }

            if (row.type === 'del') {
              const pair = charDiff && row.pairId !== undefined ? pairs.get(row.pairId) : null
              return (
                <tr key={i}>
                  <td className="prp-diff-num">{row.leftNum}</td>
                  <td className="prp-diff-cell prp-diff-cell--del">
                    {'− '}
                    {pair
                      ? <CharSpans oldText={pair.delText} newText={pair.addText} side="del" />
                      : row.text}
                  </td>
                  <td className="prp-diff-sep" />
                  <td className="prp-diff-num" />
                  <td className="prp-diff-cell prp-diff-cell--empty" />
                </tr>
              )
            }

            // add
            const pair = charDiff && row.pairId !== undefined ? pairs.get(row.pairId) : null
            return (
              <tr key={i}>
                <td className="prp-diff-num" />
                <td className="prp-diff-cell prp-diff-cell--empty" />
                <td className="prp-diff-sep" />
                <td className="prp-diff-num">{row.rightNum}</td>
                <td className="prp-diff-cell prp-diff-cell--add">
                  {'+ '}
                  {pair
                    ? <CharSpans oldText={pair.delText} newText={pair.addText} side="add" />
                    : row.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── Unified diff table ──────────────────────────────────────── */
function UnifiedDiffTable({ patch, charDiff }: { patch: string; charDiff: boolean }) {
  const rows = pairRows(parseDiff(patch))

  const pairs = new Map<number, { delText: string; addText: string }>()
  if (charDiff) {
    for (const row of rows) {
      if (row.type === 'del' && row.pairId !== undefined) {
        const existing = pairs.get(row.pairId)
        pairs.set(row.pairId, { delText: row.text, addText: existing?.addText ?? '' })
      }
      if (row.type === 'add' && row.pairId !== undefined) {
        const existing = pairs.get(row.pairId)
        pairs.set(row.pairId, { delText: existing?.delText ?? '', addText: row.text })
      }
    }
  }

  return (
    <div className="prp-diff-wrap">
      <table className="prp-diff-table prp-diff-table--unified">
        <tbody>
          {rows.map((row, i) => {
            if (row.type === 'hunk') {
              return (
                <tr key={i} className="prp-diff-hunk-row">
                  <td colSpan={4}>{row.text}</td>
                </tr>
              )
            }

            if (row.type === 'context') {
              return (
                <tr key={i}>
                  <td className="prp-diff-num">{row.leftNum}</td>
                  <td className="prp-diff-num">{row.rightNum}</td>
                  <td className="prp-diff-gutter"> </td>
                  <td className="prp-diff-cell prp-diff-cell--ctx prp-diff-cell--full">{row.text}</td>
                </tr>
              )
            }

            if (row.type === 'del') {
              const pair = charDiff && row.pairId !== undefined ? pairs.get(row.pairId) : null
              return (
                <tr key={i}>
                  <td className="prp-diff-num">{row.leftNum}</td>
                  <td className="prp-diff-num" />
                  <td className="prp-diff-gutter prp-diff-gutter--del">−</td>
                  <td className="prp-diff-cell prp-diff-cell--del prp-diff-cell--full">
                    {pair
                      ? <CharSpans oldText={pair.delText} newText={pair.addText} side="del" />
                      : row.text}
                  </td>
                </tr>
              )
            }

            // add
            const pair = charDiff && row.pairId !== undefined ? pairs.get(row.pairId) : null
            return (
              <tr key={i}>
                <td className="prp-diff-num" />
                <td className="prp-diff-num">{row.rightNum}</td>
                <td className="prp-diff-gutter prp-diff-gutter--add">+</td>
                <td className="prp-diff-cell prp-diff-cell--add prp-diff-cell--full">
                  {pair
                    ? <CharSpans oldText={pair.delText} newText={pair.addText} side="add" />
                    : row.text}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── File status badge helper ───────────────────────────────── */
function statusClass(status: string): string {
  switch (status) {
    case 'added':    return 'prp-file-status prp-file-status--added'
    case 'removed':  return 'prp-file-status prp-file-status--removed'
    case 'renamed':  return 'prp-file-status prp-file-status--renamed'
    default:         return 'prp-file-status prp-file-status--modified'
  }
}

/* ── Main component ─────────────────────────────────────────── */
export default function ChangesTab({ prId, diffView, charDiff }: Props) {
  const [files, setFiles]       = useState<FileEntry[] | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/pr-panel/${prId}/files`)
      .then(r => r.json() as Promise<{ ok: boolean; files?: FileEntry[]; error?: string }>)
      .then(d => {
        if (cancelled) return
        if (!d.ok) { setError(d.error ?? 'Failed to load files'); return }
        const f = d.files ?? []
        setFiles(f)
        if (f.length <= 5) setExpanded(new Set(f.map(x => x.filename)))
      })
      .catch(err => { if (!cancelled) setError((err as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [prId])

  function toggle(filename: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  if (loading) return <div className="prp-loading">Loading file changes…</div>
  if (error)   return <div className="prp-error">{error}</div>
  if (!files || files.length === 0) return <p className="prp-no-data">No file changes found.</p>

  const totalAdd = files.reduce((s, f) => s + f.additions, 0)
  const totalDel = files.reduce((s, f) => s + f.deletions, 0)

  return (
    <div>
      <div className="prp-changes-summary">
        {files.length} file{files.length !== 1 ? 's' : ''} changed &nbsp;
        <span className="prp-stat-add">+{totalAdd}</span> &nbsp;
        <span className="prp-stat-del">−{totalDel}</span>
      </div>

      {files.map(file => {
        const isOpen = expanded.has(file.filename)
        return (
          <div key={file.filename} className="prp-file-entry">
            <div className="prp-file-header" onClick={() => toggle(file.filename)}>
              <span className="prp-file-toggle">{isOpen ? '▾' : '▸'}</span>
              <span className="prp-file-name">{file.filename}</span>
              <span className={statusClass(file.status)}>{file.status}</span>
              <span className="prp-file-churn">
                <span className="prp-stat-add">+{file.additions}</span>
                {' '}
                <span className="prp-stat-del">−{file.deletions}</span>
              </span>
            </div>

            {isOpen && (
              file.patch
                ? diffView === 'unified'
                  ? <UnifiedDiffTable patch={file.patch} charDiff={charDiff} />
                  : <SplitDiffTable   patch={file.patch} charDiff={charDiff} />
                : <p className="prp-no-patch">No patch available (binary or large file).</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
