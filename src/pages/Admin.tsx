import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Admin.css'

type AccessRole = 'admin' | 'moderator' | 'member' | 'guest'

interface RegisteredUser {
  id: number
  name: string
  email: string
  github: string
  registration_role: string
  created_at: string
  github_user_id: number | null
  access_role: AccessRole | null
  is_self: boolean
  can_assign_role: boolean
}

interface Pagination {
  page: number
  page_size: number
  total: number
  total_pages: number
}

interface UserListResponse {
  ok: boolean
  users?: RegisteredUser[]
  pagination?: Pagination
  error?: string
}

interface RoleUpdateResponse {
  ok: boolean
  user?: {
    registration_id: number
    github: string
    github_user_id: number
    access_role: AccessRole
  }
  error?: string
}

const ROLES: AccessRole[] = ['admin', 'moderator', 'member', 'guest']

function readableDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function Admin() {
  const { user, loading: authLoading } = useAuth()
  const [users, setUsers] = useState<RegisteredUser[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [draftRoles, setDraftRoles] = useState<Record<number, AccessRole>>({})
  const [draftGitHub, setDraftGitHub] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadUsers = useCallback(async () => {
    if (user?.role !== 'admin') return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (query) params.set('q', query)
      const response = await fetch(`/api/admin/users?${params}`, { credentials: 'include' })
      const data = await response.json() as UserListResponse
      if (!response.ok || !data.ok || !data.users || !data.pagination) {
        throw new Error(data.error ?? 'Could not load registered users.')
      }
      setUsers(data.users)
      setPagination(data.pagination)
      setDraftRoles(Object.fromEntries(
        data.users.map(entry => [entry.id, entry.access_role ?? 'member']),
      ))
      setDraftGitHub(Object.fromEntries(
        data.users.map(entry => [entry.id, entry.github]),
      ))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load registered users.')
    } finally {
      setLoading(false)
    }
  }, [page, query, user?.role])

  useEffect(() => { void loadUsers() }, [loadUsers])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPage(1)
    setQuery(searchInput.trim())
    setNotice('')
  }

  async function saveRole(entry: RegisteredUser) {
    const role = draftRoles[entry.id]
    const github = (draftGitHub[entry.id] ?? entry.github).trim().replace(/^@/, '')
    const unchanged = role === (entry.access_role ?? 'member') && github === entry.github
    if (!role || !github || unchanged) return
    setSavingId(entry.id)
    setError('')
    setNotice('')
    try {
      const csrfResponse = await fetch('/api/csrf', { credentials: 'include' })
      const csrf = await csrfResponse.json() as { token?: string }
      if (!csrfResponse.ok || !csrf.token) throw new Error('Could not create a security token.')

      const response = await fetch(`/api/admin/users/${entry.id}/role`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrf.token,
        },
        body: JSON.stringify({ role, github }),
      })
      const data = await response.json() as RoleUpdateResponse
      if (!response.ok || !data.ok || !data.user) {
        throw new Error(data.error ?? 'Could not update the access role.')
      }
      const updated = data.user
      setUsers(current => current.map(item => item.id === entry.id
        ? {
            ...item,
            github: updated.github,
            github_user_id: updated.github_user_id,
            access_role: updated.access_role,
          }
        : item))
      setDraftRoles(current => ({ ...current, [entry.id]: updated.access_role }))
      setDraftGitHub(current => ({ ...current, [entry.id]: updated.github }))
      setNotice(`Updated @${updated.github} to ${updated.access_role}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the access role.')
    } finally {
      setSavingId(null)
    }
  }

  if (authLoading) {
    return <div className="admin-page container"><p className="admin-state">Checking access…</p></div>
  }
  if (!user || user.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="admin-page container">
      <header className="admin-header">
        <p className="admin-eyebrow">Administration</p>
        <h1>User access</h1>
        <p>
          Grant application roles to registered users. Every change is verified against GitHub,
          authorized again on the server, and recorded in the privileged-action audit log.
        </p>
        <nav className="admin-section-nav" aria-label="Administration sections">
          <Link to="/admin" aria-current="page">User access</Link>
          <Link to="/admin/analytics">Analytics</Link>
        </nav>
      </header>

      <section className="admin-panel" aria-labelledby="registered-users-heading">
        <div className="admin-panel-heading">
          <div>
            <h2 id="registered-users-heading">Registered users</h2>
            <p>{pagination ? `${pagination.total} registration${pagination.total === 1 ? '' : 's'}` : 'Loading registrations'}</p>
          </div>
          <form className="admin-search" onSubmit={search} role="search">
            <label htmlFor="admin-user-search">Search registered users</label>
            <div>
              <input
                id="admin-user-search"
                type="search"
                value={searchInput}
                onChange={event => setSearchInput(event.target.value)}
                placeholder="Name, email, or GitHub username"
                maxLength={100}
              />
              <button type="submit" className="btn btn-primary">Search</button>
            </div>
          </form>
        </div>

        {notice && <p className="admin-message admin-message--success" role="status">{notice}</p>}
        {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}

        {loading ? (
          <p className="admin-state">Loading registered users…</p>
        ) : users.length === 0 ? (
          <p className="admin-state">No registrations match this search.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Registration</th>
                  <th scope="col">Access role</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map(entry => {
                  const selectedRole = draftRoles[entry.id] ?? entry.access_role ?? 'member'
                  const github = draftGitHub[entry.id] ?? entry.github
                  const unchanged = selectedRole === (entry.access_role ?? 'member')
                    && github.trim().replace(/^@/, '') === entry.github
                  const disabled = entry.is_self || savingId === entry.id
                  return (
                    <tr key={entry.id}>
                      <td data-label="User">
                        <strong>{entry.name}</strong>
                        <a href={`mailto:${entry.email}`}>{entry.email}</a>
                        {entry.github
                          ? <a href={`https://github.com/${encodeURIComponent(entry.github)}`} target="_blank" rel="noreferrer">@{entry.github}</a>
                          : <span className="admin-muted">GitHub username needed before saving</span>}
                      </td>
                      <td data-label="Registration">
                        <span>{entry.registration_role || 'General'}</span>
                        <span className="admin-muted">Joined {readableDate(entry.created_at)}</span>
                      </td>
                      <td data-label="Access role">
                        <label className="sr-only" htmlFor={`role-${entry.id}`}>Access role for {entry.name}</label>
                        <select
                          id={`role-${entry.id}`}
                          value={selectedRole}
                          disabled={disabled}
                          onChange={event => setDraftRoles(current => ({
                            ...current,
                            [entry.id]: event.target.value as AccessRole,
                          }))}
                        >
                          {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                        </select>
                        {!entry.is_self && !entry.github && (
                          <>
                            <label className="admin-github-label" htmlFor={`github-${entry.id}`}>GitHub username</label>
                            <input
                              id={`github-${entry.id}`}
                              className="admin-github-input"
                              type="text"
                              value={github}
                              disabled={savingId === entry.id}
                              maxLength={40}
                              autoCapitalize="none"
                              autoCorrect="off"
                              spellCheck={false}
                              placeholder="github-username"
                              onChange={event => setDraftGitHub(current => ({
                                ...current,
                                [entry.id]: event.target.value,
                              }))}
                            />
                          </>
                        )}
                        {entry.is_self && <span className="admin-muted">Your own role is locked</span>}
                      </td>
                      <td data-label="Action">
                        <button
                          type="button"
                          className="btn btn-secondary admin-save"
                          disabled={disabled || unchanged || !github.trim()}
                          onClick={() => void saveRole(entry)}
                        >
                          {savingId === entry.id ? 'Saving…' : 'Save role'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.total_pages > 1 && (
          <nav className="admin-pagination" aria-label="Registered users pages">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage(current => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.total_pages}</span>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={page >= pagination.total_pages || loading}
              onClick={() => setPage(current => current + 1)}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </div>
  )
}
