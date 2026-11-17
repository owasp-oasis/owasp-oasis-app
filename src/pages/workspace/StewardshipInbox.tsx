import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, CircleDashed, ShieldCheck } from 'lucide-react'

type Request = {
  id: string
  oasis_repo_id: number
  repo_full_name: string
  requester_login: string
  requester_name: string | null
  status?: 'pending' | 'approved' | 'declined'
  requested_at: string
  reviewed_by_login?: string | null
  reviewed_at?: string | null
}

type Inbox = { is_admin: boolean; pending: Request[]; mine: Request[] }

async function csrfToken(): Promise<string> {
  const response = await fetch('/api/csrf', { credentials: 'include', cache: 'no-store' })
  const data = await response.json() as { token?: string }
  if (!response.ok || !data.token) throw new Error('Could not get a security token. Refresh and try again.')
  return data.token
}

export default function StewardshipInbox({ userLogin }: { userLogin: string }) {
  const [inbox, setInbox] = useState<Inbox | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notice, setNotice] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/workspace/stewardship-requests', { credentials: 'include', cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as Inbox & { error?: string }
        if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
        return data
      })
      .then(setInbox)
      .catch(caught => { if (!controller.signal.aborted) setError((caught as Error).message) })
    return () => controller.abort()
  }, [userLogin, reload])

  async function review(request: Request, decision: 'approve' | 'decline') {
    setBusyId(request.id); setError(''); setNotice('')
    try {
      const token = await csrfToken()
      const response = await fetch(`/api/workspace/repos/${request.oasis_repo_id}/stewardship-requests/${request.id}`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': token },
        body: JSON.stringify({ decision }),
      })
      const data = await response.json() as { error?: string }
      if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
      setNotice(decision === 'approve' ? `${request.requester_login} appointed for ${request.repo_full_name}.` : `Request for ${request.repo_full_name} declined.`)
      setReload(value => value + 1)
    } catch (caught) { setError((caught as Error).message) }
    finally { setBusyId('') }
  }

  if (!inbox || (!inbox.pending.length && !inbox.mine.length && !error)) return null
  return <section className="ws-stewardship-inbox" aria-labelledby="ws-stewardship-inbox-title">
    <header><div><span className="ws-stewardship-kicker"><ShieldCheck size={13} /> Repository responsibility</span><h3 id="ws-stewardship-inbox-title">Stewardship requests</h3></div>{inbox.pending.length > 0 && <span className="ws-stewardship-count">{inbox.pending.length} pending review</span>}</header>
    {error && <p className="ws-stewardship-error" role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Retry</button></p>}
    {notice && <p className="ws-stewardship-notice" role="status"><Check size={14} /> {notice}</p>}
    {inbox.is_admin && inbox.pending.length > 0 && <div className="ws-stewardship-list" aria-label="Requests awaiting OASIS review">{inbox.pending.map(request => <article className="ws-stewardship-request" key={request.id}>
      <div><strong>{request.requester_name || request.requester_login}</strong><a href={`https://github.com/${encodeURIComponent(request.requester_login)}`} target="_blank" rel="noreferrer">@{request.requester_login} ↗</a><span>Requests the Security Steward role for <b>{request.repo_full_name}</b></span><small>Requested {new Date(request.requested_at).toLocaleDateString()}</small></div>
      <div className="ws-stewardship-actions"><Link to={`/workspace/projects?repoId=${request.oasis_repo_id}`}>View project</Link><button type="button" disabled={Boolean(busyId)} onClick={() => void review(request, 'decline')}>Decline</button><button type="button" className="is-primary" disabled={Boolean(busyId)} onClick={() => void review(request, 'approve')}>{busyId === request.id ? 'Reviewing…' : 'Appoint Steward'}</button></div>
    </article>)}</div>}
    {inbox.mine.length > 0 && <div className="ws-stewardship-own"><h4>Your requests</h4>{inbox.mine.map(request => <div className="ws-stewardship-own-row" key={request.id}><span>{request.repo_full_name}</span><strong className={`is-${request.status}`}>{request.status === 'pending' ? <><CircleDashed size={13} /> Awaiting OASIS review</> : request.status === 'approved' ? <><Check size={13} /> Steward appointed</> : 'Declined'}</strong><Link to={`/workspace/projects?repoId=${request.oasis_repo_id}`}>View project</Link></div>)}</div>}
    <p className="ws-stewardship-caveat">Status is available here after sign-in. OASIS does not send email or push notifications for these requests.</p>
  </section>
}
