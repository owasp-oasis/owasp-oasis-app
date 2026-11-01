import { Check, FolderGit2 } from 'lucide-react'
import { roleName, type Assignment } from './api'
import './ContributionRoles.css'
export default function Assignments({ assignments, end, busy = false }: { assignments: Assignment[]; end?: (assignment: Assignment) => void; busy?: boolean }) {
  const active = assignments.filter(item => item.status === 'active')
  const ended = assignments.filter(item => item.status === 'ended')
  return <><div className="contribution-assignments">{active.length ? active.map(role => <article key={role.id}>
    <div><strong>{roleName(role.role)}</strong><span className="contribution-repo"><FolderGit2 size={14} />{role.repository}</span><small>Confirmed {new Date(role.assigned_at).toLocaleDateString()}</small></div>
    <div className="contribution-assignment-actions"><span className="contribution-status"><Check size={12} />{role.role === 'steward' ? 'Assigned' : 'Designated'}</span>{end && <button type="button" disabled={busy} className="ws-link" onClick={() => end(role)}>End assignment</button>}</div>
  </article>) : <p>No assignments yet. Confirmed repository responsibilities will appear here.</p>}</div>
    {!!ended.length && <details className="contribution-history"><summary>Past assignments ({ended.length})</summary>{ended.map(role => <p key={role.id}>{roleName(role.role)} · {role.repository} · Ended {new Date(role.ended_at!).toLocaleDateString()}</p>)}</details>}
  </>
}
