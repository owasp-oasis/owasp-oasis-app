import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import './SortableTable.css'

export interface Column<T> {
  key: keyof T
  label: ReactNode
  sortable?: boolean
  searchable?: boolean
  render?: (value: unknown, row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props<T extends Record<string, any>> {
  columns: Column<T>[]
  data: T[]
  defaultSort?: keyof T
  defaultDir?: 'asc' | 'desc'
  searchPlaceholder?: string
  emptyMessage?: string
  rowKey: keyof T
  onRowClick?: (row: T) => void
  activeRowKey?: unknown   // value of rowKey for the currently-active (highlighted) row
  rowClassName?: (row: T) => string  // optional extra CSS class per row
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function SortableTable<T extends Record<string, any>>({
  columns,
  data,
  defaultSort,
  defaultDir = 'desc',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No data yet.',
  rowKey,
  onRowClick,
  activeRowKey,
  rowClassName,
}: Props<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(defaultSort ?? null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir)
  const [query, setQuery] = useState('')

  const searchableCols = columns.filter(c => c.searchable !== false)

  const filtered = useMemo(() => {
    if (!query.trim()) return data
    const q = query.toLowerCase()
    return data.filter(row =>
      searchableCols.some(col => {
        const v = row[col.key]
        return v != null && String(v).toLowerCase().includes(q)
      })
    )
  }, [data, query, searchableCols])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir])

  function handleSort(key: keyof T) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="sortable-table-wrap">
      <div className="sortable-table-toolbar">
        <input
          className="sortable-table-search"
          type="search"
          placeholder={searchPlaceholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label={searchPlaceholder}
        />
        <span className="sortable-table-count">
          {sorted.length} {sorted.length === 1 ? 'result' : 'results'}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="sortable-table-empty">{query ? 'No results match your search.' : emptyMessage}</div>
      ) : (
        <div className="sortable-table-scroll">
          <table className="sortable-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th
                    key={String(col.key)}
                    style={{ textAlign: col.align ?? 'left' }}
                    className={col.sortable !== false ? 'sortable' : ''}
                    onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                    aria-sort={
                      sortKey === col.key
                        ? sortDir === 'asc' ? 'ascending' : 'descending'
                        : undefined
                    }
                  >
                    {col.label}
                    {col.sortable !== false && (
                      <span className="sort-indicator" aria-hidden="true">
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(row => {
                const isActive = activeRowKey !== undefined && row[rowKey] === activeRowKey
                return (
                  <tr
                    key={String(row[rowKey])}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={[
                      onRowClick   ? 'sortable-table-row--clickable' : '',
                      isActive     ? 'sortable-table-row--active'    : '',
                      rowClassName ? rowClassName(row)               : '',
                    ].filter(Boolean).join(' ') || undefined}
                  >
                    {columns.map(col => (
                      <td
                        key={String(col.key)}
                        style={{ textAlign: col.align ?? 'left' }}
                      >
                        {col.render
                          ? col.render(row[col.key], row)
                          : row[col.key] != null ? String(row[col.key]) : '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
