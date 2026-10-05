import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react'
import PRPanel, { type PanelPR } from '../../components/PRPanel/PRPanel'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import type { Decision } from '../../components/VoteForm'
import { useWorkspaceData } from './useWorkspaceData'
import { finding, fixPath, fixStatus, matchesPreferences, matchesSearch, sortFixes, type CandidateFix } from './fixModel'
import { SeverityChip } from './FixChips'

const DECISION_LABELS: Record<Decision, string> = { accept: 'Accept', modify: 'Modify', reject: 'Reject', duplicate: 'Duplicate' }

function ConsensusBar({ pr }: { pr: CandidateFix }) {
  const total = pr.consensus_accept + pr.consensus_modify + pr.consensus_reject
  const tip = total
    ? `Validator consensus · ${total} ${total === 1 ? 'vote' : 'votes'}: ${pr.consensus_accept} Accept · ${pr.consensus_modify} Modify · ${pr.consensus_reject} Reject.`
    : 'Validator consensus · no votes yet'
  return <span className="ws-row-consensus" title={tip} aria-label={tip}>
    <span className="ws-row-consensus-bar" aria-hidden="true">
      <span className="ws-row-consensus-accept" style={{ width: `${total ? pr.consensus_accept / total * 100 : 0}%` }} />
      <span className="ws-row-consensus-modify" style={{ width: `${total ? pr.consensus_modify / total * 100 : 0}%` }} />
      <span className="ws-row-consensus-reject" style={{ width: `${total ? pr.consensus_reject / total * 100 : 0}%` }} />
    </span>
    <span className="ws-row-consensus-count">{total || '—'}</span>
  </span>
}

export default function PRsTab({ data, loading }: { data: CandidateFix[]; loading: boolean }) {
  const { user, loading: authLoading, preferences: onboarding } = useAuth()
  const { preferences, loading: prefsLoading, error: prefsError, notify } = useWorkspace()
  const votes = useWorkspaceData<{ votes?: {pr_id: number; decision: Decision}[] }>(user ? '/api/votes/mine' : null, {})
  const [recorded, setRecorded] = useState<Map<number, Decision>>(new Map())
  const [params] = useSearchParams()
  const route = useParams()
  const navigate = useNavigate()
  const [closed, setClosed] = useState(false)
  const layoutParam = params.get('layout')
  const layout = layoutParam === 'split' || layoutParam === 'table' || layoutParam === 'focus' ? layoutParam : preferences.layout
  const filter = params.get('filter') ?? (user ? 'mine' : 'needs')
  const query = params.get('q') ?? ''
  const repo = params.get('repo') ?? ''
  const bypass = params.get('all') === '1'
  useEffect(() => setRecorded(new Map()), [user?.login])
  const myVotes = useMemo(() => new Map([...(votes.data.votes ?? []).map(v=>[v.pr_id,v.decision] as const), ...recorded]), [votes.data,recorded])
  const augmented = useMemo(() => data.map(pr=> {const decision = recorded.get(pr.id);return decision?{...pr,[`consensus_${decision}`]:(pr[`consensus_${decision}`]??0)+1}:pr}),[data,recorded])
  const languageFilters = (params.get('lang')?.split(',') ?? (!bypass ? onboarding?.languages : [])) ?? []
  const severityFilters = params.get('severity')?.split(',') ?? []
  const filtered = sortFixes(augmented.filter(pr =>
    (!repo || String(pr.repo_id)===repo) && matchesSearch(pr,query) &&
    (bypass || matchesPreferences(pr,preferences,myVotes)) &&
    (!languageFilters.length || languageFilters.some(lang=>lang.toLowerCase()===pr.language?.toLowerCase())) &&
    (!severityFilters.length || severityFilters.includes(finding(pr).severity)) &&
    (filter==='mine' ? pr.state==='open' && !myVotes.has(pr.id) : filter==='needs' ? fixStatus(pr)==='Needs review' : filter==='trusted' ? fixStatus(pr)==='Trusted' : filter==='accepted' ? fixStatus(pr)==='Accepted' : filter==='withdrawn' ? fixStatus(pr)==='Withdrawn' : filter==='rejected' ? fixStatus(pr)==='Rejected' : true)
  ))
  const requested = route.repo ? augmented.find(pr=>pr.repo_name===route.repo && String(pr.number)===route.number) : augmented.find(pr=>String(pr.id)===params.get('fix'))
  // Keep a deep-linked candidate visible even when the current filters would otherwise hide it.
  const reviewItems = requested && !filtered.some(pr=>pr.id===requested.id) ? [requested, ...filtered] : filtered
  const selected = closed ? null : requested ?? (layout !== 'table' ? filtered[0] : null)
  const selectedIndex = reviewItems.findIndex(pr=>pr.id===selected?.id)
  useLayoutEffect(() => {
    if (!selected || (layout !== 'split' && layout !== 'table')) return
    const scrollSelectedRow = () => {
      const row = document.querySelector<HTMLElement>(`.ws-fix-row[data-pr-id="${selected.id}"]`)
      if (!row) return false
      const list = row.closest<HTMLElement>('.ws-fix-list')
      if (list) {
        const rowRect = row.getBoundingClientRect()
        const listRect = list.getBoundingClientRect()
        const targetTop = list.scrollTop + rowRect.top - listRect.top - (list.clientHeight - rowRect.height) / 2
        list.scrollTop = Math.max(0, Math.min(targetTop, list.scrollHeight - list.clientHeight))
        return true
      }
      row.scrollIntoView({ block: 'center', inline: 'nearest' })
      return true
    }
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(scrollSelectedRow)
    })
    let attempts = 0
    const retry = window.setInterval(() => {
      attempts += 1
      scrollSelectedRow()
      if (attempts >= 40) window.clearInterval(retry)
    }, 50)
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(retry)
    }
  }, [layout, selected?.id, reviewItems.length])
  const projects = [...new Map(data.map(pr=>[pr.repo_id,pr.repo_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1]))
  const needCount = augmented.filter(pr=>pr.state==='open'&&!myVotes.has(pr.id)).length
  const statusCount = (status: string) => augmented.filter(pr => fixStatus(pr) === status).length
  const patch = (values: Record<string,string|null>) => {const next=new URLSearchParams(params);Object.entries(values).forEach(([key,value])=>value===null?next.delete(key):next.set(key,value));navigate('/workspace/fixes?'+next.toString(),{replace:true});setClosed(false)}
  const open = (pr: CandidateFix) => {setClosed(false);navigate(fixPath(pr)+(params.size?'?'+params.toString():''),{replace:true})}
  useEffect(()=>{
    if(!preferences.keyboardShortcuts) return
    const handle=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey)return
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest('input,textarea,select,[contenteditable=true]')
      if(typing){
        if(event.key==='Escape') target?.blur()
        return
      }
      if(!['ArrowDown','ArrowUp'].includes(event.key))return
      const next=reviewItems[selectedIndex+(event.key==='ArrowDown'?1:-1)]
      if(next){event.preventDefault();open(next)}
    }
    document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle)
  },[preferences.keyboardShortcuts,reviewItems,selectedIndex,open])
  function voted(pr:PanelPR,decision:Decision){
    setRecorded(previous=>new Map(previous).set(pr.id,decision));notify(`Vote recorded on ${pr.repo_name}#${pr.number}`)
    const rest=[...filtered.slice(selectedIndex+1),...filtered.slice(0,Math.max(0,selectedIndex))]
    const next=rest.find(item=>item.id!==pr.id&&item.state==='open'&&!myVotes.has(item.id))
    if(next)open(next);else {setClosed(true);navigate('/workspace/fixes?'+params.toString(),{replace:true})}
  }
  if(loading||authLoading||votes.loading||prefsLoading)return <div className="ws-loading" role="status">Loading candidate fixes…</div>
  if(votes.error)return <div className="ws-error" role="alert">Could not load your votes. <button className="ws-button" onClick={votes.retry}>Retry</button></div>
  const restricted = !bypass && (preferences.hideClosed || (user&&preferences.hideVoted) || preferences.repositories.length>0 || preferences.cwes.length>0 || preferences.minimumSeverity!=='low' || languageFilters.length>0)
  const preferenceLabel = bypass
    ? 'Preferences off'
    : `My preferences${preferences.repositories.length ? ` · ${preferences.repositories.length} repos` : ''}${preferences.cwes.length ? ` · ${preferences.cwes.length} CWEs` : ''}`
  return <>
    <div className="ws-toolbar">
      <div className="ws-toolbar-main">
        <div className={`ws-preferences-toggle ${bypass ? 'is-off' : 'is-active'}`}>
          <button type="button" aria-pressed={!bypass} aria-label={bypass ? 'Use my preferences' : 'Turn off my preferences'} onClick={()=>patch({all:bypass?null:'1'})}>
            <Filter size={15} strokeWidth={2.25} aria-hidden="true" />{preferenceLabel}
          </button>
          <Link to="/workspace/preferences" aria-label="Edit workspace preferences">Edit</Link>
        </div>
        <label className="ws-search"><Search size={16}/><input type="search" aria-label="Search candidate fixes" placeholder="Search PR #, repo, title, or CWE…" value={query} onChange={e=>patch({q:e.target.value||null})} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();patch({q:null});e.currentTarget.blur()}}}/></label>
        <select aria-label="Project" value={repo} onChange={e=>patch({repo:e.target.value||null})}><option value="">All projects</option>{projects.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        {preferences.keyboardShortcuts&&<span className="ws-keyboard-hint" aria-label="Use the up and down arrow keys to navigate candidate fixes"><kbd>↑</kbd><kbd>↓</kbd><span>navigate</span></span>}
      </div>
      <div className="ws-status-tabs" aria-label="Candidate fix status">{[...(user?[['mine',`Needs my vote ${needCount}`]]:[]),['all',`All ${augmented.length}`],['needs',`Needs review ${statusCount('Needs review')}`],['trusted',`Trusted ${statusCount('Trusted')}`],['accepted',`Accepted ${statusCount('Accepted')}`],['withdrawn',`Withdrawn ${statusCount('Withdrawn')}`],['rejected',`Rejected ${statusCount('Rejected')}`]].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>patch({filter:key})}>{label}</button>)}</div>
    </div>
    {restricted || bypass ? <div className="ws-filter-summary"><span>{filtered.length} candidate fixes</span>{restricted ? <span>Filtered by your preferences · <button className="ws-link" onClick={()=>patch({all:'1'})}>Show all</button></span> : <button className="ws-link" onClick={()=>patch({all:null})}>Use my preferences</button>}</div> : null}
    {prefsError&&<p className="ws-error">Saved preferences could not be loaded. <Link to="/workspace/preferences">Retry in Preferences</Link></p>}
    {route.repo&&!requested&&<p className="ws-error" role="alert">This candidate fix is not available in the current Workspace collection. <Link to="/workspace/fixes">Return to candidate fixes</Link></p>}
    {!filtered.length&&<div className="ws-empty"><h2>No candidate fixes match</h2><p>{needCount?'Your filters hide available work.':'Nothing needs your vote in this collection.'}</p><button className="ws-button" onClick={()=>patch({q:null,repo:null,all:'1',filter:'all',lang:null,severity:null})}>Clear filters</button></div>}
    {layout==='table' ? <div className="ws-table-scroll"><table className="ws-fix-table"><thead><tr><th>Candidate fix</th><th>Severity</th><th>Status</th><th>Consensus</th><th>People</th><th>My vote</th><th aria-label="Open" /></tr></thead><tbody>{reviewItems.map(pr=><tr data-pr-id={pr.id} key={pr.id} className={pr.id===selected?.id?'is-selected':''} onClick={()=>open(pr)}><td><button className="ws-title-link" onClick={event=>{event.stopPropagation();open(pr)}}><span className="ws-table-repo">{pr.repo_name} #{pr.number}</span><span className="ws-table-title">{pr.title}</span></button></td><td><SeverityChip title={pr.title}/></td><td><span className={'ws-chip ws-status--'+fixStatus(pr).toLowerCase().replace(' ','-')}>{fixStatus(pr)}</span></td><td><ConsensusBar pr={pr}/></td><td className="ws-table-people">{pr.participants}</td><td className="ws-table-vote">{myVotes.has(pr.id) ? DECISION_LABELS[myVotes.get(pr.id)!] : '—'}</td><td className="ws-row-chevron" aria-hidden="true">›</td></tr>)}</tbody></table></div> : layout==='split' ? <div className="ws-review-grid"><div className="ws-fix-list" aria-label="Candidate fixes">{reviewItems.map(pr=><button data-pr-id={pr.id} className={'ws-fix-row'+(pr.id===selected?.id?' is-selected':'')} key={pr.id} onClick={()=>open(pr)} aria-current={pr.id===selected?.id?'true':undefined}><span className="ws-fix-row-top"><span className="ws-meta">{pr.repo_name} #{pr.number}</span><SeverityChip title={pr.title}/></span><strong>{pr.title}</strong><span className="ws-fix-row-bottom"><span className={'ws-chip ws-status--'+fixStatus(pr).toLowerCase().replace(' ','-')}>{fixStatus(pr)}</span><ConsensusBar pr={pr}/>{myVotes.has(pr.id)&&<span className={'ws-chip ws-decision--'+myVotes.get(pr.id)}>You voted {DECISION_LABELS[myVotes.get(pr.id)!]}</span>}</span></button>)}</div><div className="ws-detail-slot"><PRPanel pr={selected??null} presentation="inline" myVotes={myVotes} onClose={()=>setClosed(true)} onVoteSuccess={voted}/>{!selected&&<div className="ws-empty">Choose a candidate fix to begin.</div>}</div></div> : <div className="ws-focus"><div className="ws-focus-controls"><button className="ws-button" disabled={selectedIndex<=0} onClick={()=>open(reviewItems[selectedIndex-1])}><ChevronLeft size={16}/>Previous</button><span>{selectedIndex<0?0:selectedIndex+1} of {reviewItems.length}</span><button className="ws-button" disabled={selectedIndex>=reviewItems.length-1} onClick={()=>open(reviewItems[selectedIndex+1])}>Next<ChevronRight size={16}/></button></div><PRPanel pr={selected??null} presentation="inline" myVotes={myVotes} onClose={()=>setClosed(true)} onVoteSuccess={voted}/></div>}
    {layout==='table'&&<PRPanel pr={selected??null} myVotes={myVotes} onClose={()=>setClosed(true)} onVoteSuccess={voted}/>}
  </>
}
