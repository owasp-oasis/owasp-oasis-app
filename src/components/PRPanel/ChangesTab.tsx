/**
 * ChangesTab — diff viewer for PR file changes.
 * Fetches /api/pr-panel/:id/files on first activation.
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

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'prp-diff-line prp-diff-ctx'
  if (line.startsWith('+'))  return 'prp-diff-line prp-diff-add'
  if (line.startsWith('-'))  return 'prp-diff-line prp-diff-del'
  if (line.startsWith('@@')) return 'prp-diff-line prp-diff-hunk'
  return 'prp-diff-line prp-diff-ctx'
}

function statusClass(status: string): string {
  switch (status) {
    case 'added':    return 'prp-file-status prp-file-status--added'
    case 'removed':  return 'prp-file-status prp-file-status--removed'
    case 'renamed':  return 'prp-file-status prp-file-status--renamed'
    default:         return 'prp-file-status prp-file-status--modified'
  }
}

export default function ChangesTab({ prId }: Props) {
  const [files, setFiles] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
              file.patch ? (
                <pre className="prp-diff">
                  {file.patch.split('\n').map((line, i) => (
                    <span key={i} className={lineClass(line)}>{line}</span>
                  ))}
                </pre>
              ) : (
                <p className="prp-no-patch">No patch available (binary or large file).</p>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
