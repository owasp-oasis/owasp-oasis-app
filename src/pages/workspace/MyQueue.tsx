import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import type { Decision } from '../../components/VoteForm'
import { finding, fixPath, matchesPreferences, relativeTime, sortFixes, type CandidateFix } from './fixModel'
import { SeverityChip } from './FixChips'
import { useWorkspaceData } from './useWorkspaceData'
export default function MyQueue({ data, loading, votes, voteError, retryVotes }: { data: CandidateFix[]; loading: boolean; votes: Map<number, Decision>; voteError: string | null; retryVotes: () => void }) {
  const { user } = useAuth()
  const { preferences, loading: prefsLoading, error: prefsError } = useWorkspace()
  const profile = useWorkspaceData<any>(user ? '/api/contributors/' + encodeURIComponent(user.login) : null, null)
  const queue = sortFixes(data.filter(pr => pr.state === 'open' && !votes.has(pr.id) && matchesPreferences(pr, preferences, votes)))
  const close = queue.filter(pr => pr.participants > 0 && pr.participants < 10 && pr.consensus_accept / Math.max(1,pr.consensus_accept + pr.consensus_modify + pr.consensus_reject) >= .75).sort((a,b)=>b.participants-a.participants).slice(0,4)
  if (loading || prefsLoading) return <div className="ws-loading" role="status">Loading your queue…</div>
  if (voteError) return <div className="ws-error" role="alert">Your votes could not be loaded. <button className="ws-button" onClick={retryVotes}>Retry</button></div>
  return <>
    {prefsError && <p className="ws-error">Saved preferences are unavailable. <Link to="/workspace/preferences">Retry in Preferences</Link></p>}
    <section className="ws-welcome">
      <div><span className="ws-eyebrow">{user ? 'Welcome back, ' + user.login : 'Fix open source. Together.'}</span><h2>{queue.length} candidate fixes are waiting for {user ? 'your' : ''} validation.</h2><p>A single validation takes roughly eight minutes. Start with the highest severity, or pick up fixes that are close to Trusted.</p><div className="ws-actions">{queue[0] && <Link className="ws-button ws-button--primary" to={fixPath(queue[0]) + '?filter=' + (user ? 'mine' : 'open')}>Start reviewing <ArrowRight size={16} /></Link>}<Link className="ws-button ws-button--on-brand" to="/workspace/fixes">Browse all fixes</Link></div></div>
      {user && <dl className="ws-welcome-stats"><div><dt>Your votes</dt><dd>{votes.size}</dd></div>{profile.data?.contributor && <><div><dt>Reputation</dt><dd>{Number(profile.data.contributor.modified_reputation ?? 0).toFixed(1)}</dd></div><div><dt>90-day rank</dt><dd>{profile.data.contributor.rank_90d ? '#' + profile.data.contributor.rank_90d : '—'}</dd></div></>}</dl>}
    </section>
    <div className="ws-queue-grid"><section className="ws-card"><header><h3>Up next, by severity</h3><Link to="/workspace/fixes">View queue</Link></header>{queue.slice(0,5).map(pr=><Link className="ws-up-next" key={pr.id} to={fixPath(pr)}><SeverityChip title={pr.title}/><div><strong>{pr.title}</strong><span className="ws-meta">{pr.repo_name} #{pr.number} · {finding(pr).cwe || 'Unclassified'}{finding(pr).cweName ? ' · ' + finding(pr).cweName : ''}</span></div><time title={pr.updated_at}>{relativeTime(pr.updated_at)}</time></Link>)}{!queue.length && <div className="ws-empty"><h3>Nothing needs your vote</h3><p>Your saved filters may be hiding candidate fixes.</p><Link to="/workspace/fixes?all=1&filter=all">Show all fixes</Link></div>}</section>
    <section className="ws-card"><header><div><h3>Close to Trusted</h3><p>Open fixes that need a few more validators to reach 10 participants and 75% accept.</p></div></header>{close.map(pr=>{const total=pr.consensus_accept+pr.consensus_modify+pr.consensus_reject; const rate=total?Math.round(pr.consensus_accept/total*100):0; return <Link className="ws-close-trusted" key={pr.id} to={fixPath(pr)}><strong>{pr.title}</strong><span className="ws-meta">{pr.participants}/10 · {rate}%</span><progress value={pr.participants} max={10} aria-label={pr.title + ' participants'} /></Link>})}{!close.length && <div className="ws-empty"><p>No fixes are close to Trusted in your current queue.</p><Link to="/workspace/fixes">Find a review</Link></div>}</section></div>
  </>
}
