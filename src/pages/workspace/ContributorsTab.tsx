import { useEffect, useState } from 'react'
import ContributorAvatar from '../../components/ContributorAvatar'
import { useAuth } from '../../context/AuthContext'
import { useWorkspaceData } from './useWorkspaceData'

interface Contributor { login: string; avatar_url: string | null; prs_worked: number; accepts: number; modifies: number; rejects: number; base_reputation: number; modified_reputation: number; rank_90d: number | null }
interface Detail extends Contributor { comment_score: number; peer_score: number; reaction_score: number; trust_score: number }
interface DetailResponse { contributor?: Detail; public_badges?: Array<{ team_name: string; badge_key: string; qualifying_count?: number }> }
const initials = (login: string) => login.slice(0, 2).toUpperCase()

export default function ContributorsTab({ data, loading }: { data: Contributor[]; loading: boolean }) {
  const { user } = useAuth()
  const [activeLogin, setActiveLogin] = useState<string | null>(data[0]?.login ?? null)
  useEffect(() => {
    if (!activeLogin && data[0]?.login) setActiveLogin(data[0].login)
  }, [activeLogin, data])
  const detail = useWorkspaceData<DetailResponse>(activeLogin ? '/api/contributors/' + encodeURIComponent(activeLogin) : null, {})
  if (loading) return <div className="tab-loading">Loading contributors…</div>
  if (!data.length) return <div className="tab-empty">No validator data yet. Sync will populate this shortly.</div>
  const maxRep = Math.max(...data.map(row => Number(row.modified_reputation) || 0), 1)
  const selected = detail.data.contributor ?? data.find(row => row.login === activeLogin) ?? data[0]
  return <div className="validator-layout">
    <section className="validator-table" aria-label="Validators">
      <div className="validator-table-head"><span>Rank</span><span>Validator</span><span>Reputation</span><span>90-day</span><span>Fixes</span><span>A / M / R</span></div>
      {data.map((row, index) => <button type="button" key={row.login} className={'validator-row' + (row.login === selected.login ? ' is-selected' : '')} onClick={() => setActiveLogin(row.login)}>
        <span className="validator-rank">#{index + 1}</span><span className="validator-person"><ContributorAvatar login={row.login} src={row.avatar_url} size={28} /><strong>{row.login}</strong>{user?.login === row.login && <small>YOU</small>}</span>
        <span className="validator-reputation"><b>{Number(row.modified_reputation).toFixed(1)}</b><i><em style={{ width: `${Math.min(100, Number(row.modified_reputation) / maxRep * 100)}%` }} /></i></span><span className="validator-mono">#{row.rank_90d ?? '—'}</span><span className="validator-mono">{row.prs_worked}</span><span className="validator-votes"><b>{row.accepts}</b> / <i>{row.modifies}</i> / <em>{row.rejects}</em></span>
      </button>)}
    </section>
    <aside className="validator-profile">
      <div className="validator-profile-head"><span className="validator-profile-avatar">{initials(selected.login)}</span><div><strong>{selected.login}</strong><small>Rank #{data.findIndex(row => row.login === selected.login) + 1} · 90-day #{selected.rank_90d ?? '—'}</small></div></div>
      <div><span className="ws-eyebrow">Modified reputation</span><strong className="validator-score">{Number(selected.modified_reputation).toFixed(1)}</strong><small>Base {Number(selected.base_reputation).toFixed(1)} × bonus multiplier</small></div>
      {detail.loading ? <p className="validator-muted">Loading score details…</p> : <div className="validator-parts">{[['Comment score', detail.data.contributor?.comment_score ?? 0], ['Peer score', detail.data.contributor?.peer_score ?? 0], ['Reaction score', detail.data.contributor?.reaction_score ?? 0], ['Trust score', detail.data.contributor?.trust_score ?? 0]].map(([label, value]) => <div key={String(label)}><span>{label}<b>{Number(value).toFixed(1)}</b></span><i><em style={{ width: `${Math.min(100, Number(value) / Math.max(1, Number(selected.modified_reputation)) * 100)}%` }} /></i></div>)}</div>}
      {!!detail.data.public_badges?.length && <section className="validator-badges"><h4>Team badges</h4><small>Shared by the member and Team admin</small>{detail.data.public_badges.map((badge, index) => <div key={`${badge.team_name}-${index}`}><span>★</span><strong>{badge.team_name}<small>{badge.badge_key === 'contributor_milestone' ? `Team contributor · ${badge.qualifying_count ?? 0} attributed validations` : 'Team member'}</small></strong></div>)}</section>}
      <p className="validator-footnote">Base = comment + peer + reaction + trust. Trust earns 10 points for each Accept vote on a fix merged upstream.</p>
    </aside>
  </div>
}
