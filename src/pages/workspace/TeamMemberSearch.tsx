import { useEffect, useRef, useState } from 'react'
import { errorMessage, teamGet } from './teamApi'

interface Props {
  teamId: number
  excluded: string[]
  busy: boolean
  onInvite: (login: string) => Promise<boolean>
}

export default function TeamMemberSearch({ teamId, excluded, busy, onInvite }: Props) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ query: string; members: { login: string }[]; error?: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const [inviting, setInviting] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const search = query.trim().replace(/^@/, '').toLowerCase()
  const valid = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/.test(search) && !search.includes('--')
  const ready = valid && search.length >= 2
  const loading = ready && result?.query !== search
  const excludedSet = new Set(excluded.map(login => login.toLowerCase()))
  const matches = result?.query === search ? result.members.filter(member => !excludedSet.has(member.login.toLowerCase())) : []
  const error = result?.query === search ? result.error : undefined
  const directInvite = valid && !excludedSet.has(search) && !loading && !matches.some(member => member.login === search)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void teamGet<{ members: { login: string }[] }>(`/api/teams/${teamId}/member-options?q=${encodeURIComponent(search)}`)
        .then(response => { if (!cancelled) setResult({ query: search, members: response.members }) })
        .catch(caught => { if (!cancelled) setResult({ query: search, members: [], error: errorMessage(caught) }) })
    }, 200)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [teamId, search, ready, retry])

  async function invite(login: string) {
    setInviting(login)
    try {
      if (await onInvite(login)) {
        // A successful invitation has been acknowledged by the parent. Clear
        // the stale query so the no-match/direct-invite state does not linger.
        setQuery('')
        setResult(null)
        input.current?.focus()
      }
    } finally { setInviting(null) }
  }

  const helper = !query.trim()
    ? 'Search by GitHub username to invite a member.'
    : !ready
      ? 'Type at least 2 characters to find OASIS members.'
      : loading
        ? 'Finding members…'
        : error
          ? 'Member search is unavailable.'
          : matches.length
            ? `${matches.length} matching ${matches.length === 1 ? 'member' : 'members'}. Choose whom to invite.`
            : excludedSet.has(search)
              ? 'This person is already a member or has a pending invitation.'
              : 'No available members match your search.'

  return <div className="team-repo-form">
    <label>Find a member<input ref={input} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by GitHub username…" maxLength={40} aria-describedby="team-member-results-summary" /></label>
    <p className="team-help" id="team-member-results-summary" role="status">{helper}</p>
    {error && <p className="team-error" role="alert">{error} <button className="team-link" onClick={() => { setResult(null); setRetry(value => value + 1) }}>Retry</button></p>}
    {matches.length > 0 && <ul className="team-repo-results" aria-label="Matching members">{matches.map(member => <li className="team-row" key={member.login}>
      <strong className="team-row-main">@{member.login}</strong>
      <button type="button" className="team-button" disabled={busy || inviting !== null} aria-label={'Invite ' + member.login} onClick={() => void invite(member.login)}>{inviting === member.login ? 'Inviting…' : '+ Invite'}</button>
    </li>)}</ul>}
    {directInvite && <div className="team-member-direct"><p className="team-help">Know their exact GitHub username? You can invite them even if they’re not listed.</p><button type="button" className="team-button" disabled={busy || inviting !== null} onClick={() => void invite(search)}>{inviting === search ? 'Inviting…' : `Invite @${search} by username`}</button></div>}
  </div>
}
