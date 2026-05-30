/**
 * ChangesTab — side-by-side diff viewer for PR file changes.
 * Fetches /api/pr-panel/:id/files on first activation.
 * Parses unified diff patches into paired left/right rows for display.
 */
import { useState, useEffect } from 'react'

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
}

/* ── Diff row types ─────────────────────────────────────────── */
type DiffRow =
  | { type: 'hunk';    text: string }
  | { type: 'context'; leftNum: number; rightNum: number; text: string }
  | { type: 'del';     leftNum: number; text: string }
  | { type: 'add';     rightNum: number; text: string }

/** Parse a unified diff patch string into structured rows. */
function parseDiff(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let leftLine  = 0
  let rightLine = 0

  // Buffer del lines to pair with following add lines
  const delBuf: { leftNum: number; text: string }[] = []

  function flushDels() {
    for (const d of delBuf) rows.push({ type: 'del', leftNum: d.leftNum, text: d.text })
    delBuf.length = 0
  }

  for (const raw of patch.split('\n')) {
    // Hunk header: @@ -l,s +l,s @@
    const hunkMatch = raw.match(/^@@[^@]*@@(.*)/)
    if (hunkMatch) {
      flushDels()
      // Extract start line numbers
      const nums = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (nums) {
        leftLine  = parseInt(nums[1], 10)
        rightLine = parseInt(nums[2], 10)
      }
      rows.push({ type: 'hunk', text: raw })
      continue
    }

    if (raw.startsWith('-') && !raw.startsWith('---')) {
      flushDels() // flush previous dels before this new del
      delBuf.push({ leftNum: leftLine, text: raw.slice(1) })
      leftLine++
      continue
    }

    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      if (delBuf.length > 0) {
        // Pair add with a del if available
        const paired = delBuf.shift()!
        rows.push({ type: 'del', leftNum: paired.leftNum, text: paired.text })
        rows.push({ type: 'add', rightNum: rightLine, text: raw.slice(1) })
      } else {
        rows.push({ type: 'add', rightNum: rightLine, text: raw.slice(1) })
      }
      rightLine++
      continue
    }

    // Context line (or +++ / --- header)
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

/* ── Side-by-side table ─────────────────────────────────────── */
function DiffTable({ patch }: { patch: string }) {
  const rows = parseDiff(patch)

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
              return (
                <tr key={i}>
                  <td className="prp-diff-num">{row.leftNum}</td>
                  <td className="prp-diff-cell prp-diff-cell--del">{'− ' + row.text}</td>
                  <td className="prp-diff-sep" />
                  <td className="prp-diff-num" />
                  <td className="prp-diff-cell prp-diff-cell--empty" />
                </tr>
              )
            }

            // add
            return (
              <tr key={i}>
                <td className="prp-diff-num" />
                <td className="prp-diff-cell prp-diff-cell--empty" />
                <td className="prp-diff-sep" />
                <td className="prp-diff-num">{row.rightNum}</td>
                <td className="prp-diff-cell prp-diff-cell--add">{'+ ' + row.text}</td>
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
export default function ChangesTab({ prId }: Props) {
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
        // Auto-expand all if ≤5 files
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
                ? <DiffTable patch={file.patch} />
                : <p className="prp-no-patch">No patch available (binary or large file).</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
