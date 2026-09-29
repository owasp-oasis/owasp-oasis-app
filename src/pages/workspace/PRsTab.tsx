import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import PRPanel, { type PanelPR } from '../../components/PRPanel/PRPanel'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import type { Decision } from '../../components/VoteForm'
import { useWorkspaceData } from './useWorkspaceData'
import { finding, fixPath, fixStatus, matchesPreferences, matchesSearch, relativeTime, severityOrder, sortFixes, type CandidateFix } from './fixModel'
import { FixChips, SeverityChip } from './FixChips'
export default function PRsTab({ data, loading }: { data: CandidateFix[]; loading: boolean }) {
  const { user, loading: authLoading, preferences: onboarding } = useAuth()
  const { preferences, loading: prefsLoading, error: prefsError, notify } = useWorkspace()
  const votes = useWorkspaceData<{ votes?: {pr_id: number; decision: Decision}[] }>(user ? '/api/votes/mine' : null, {})
  const [recorded, setRecorded] = useState<Map<number, Decision>>(new Map())
  const [params] = useSearchParams()
  const route = useParams()
  const navigate = useNavigate()
  const [sort, setSort] = useState('severity')
  const [ascending, setAscending] = useState(false)
  const [closed, setClosed] = useState(false)
  const layoutParam = params.get('layout')
  const layout = layoutParam === 'split' || layoutParam === 'table' || layoutParam === 'focus' ? layoutParam : preferences.layout
  const filter = params.get('filter') ?? (user ? 'mine' : 'open')
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
    (filter==='mine' ? pr.state==='open' && !myVotes.has(pr.id) : filter==='open' ? pr.state==='open' : filter==='trusted' ? fixStatus(pr)==='Trusted' : true)
  )).sort((a,b)=>{
    if(sort==='severity') return (severityOrder[finding(a).severity]-severityOrder[finding(b).severity])*(ascending?1:-1)
    const av = sort==='status'?fixStatus(a):sort==='cwe'?finding(a).cwe:sort==='repo'?a.repo_name:a.updated_at??''
    const bv = sort==='status'?fixStatus(b):sort==='cwe'?finding(b).cwe:sort==='repo'?b.repo_name:b.updated_at??''
    return av.localeCompare(bv)*(ascending?1:-1)
  })
  const requested = route.repo ? augmented.find(pr=>pr.repo_name===route.repo && String(pr.number)===route.number) : augmented.find(pr=>String(pr.id)===params.get('fix'))
  const selected = closed ? null : requested ?? (layout !== 'table' ? filtered[0] : null)
  const selectedIndex = filtered.findIndex(pr=>pr.id===selected?.id)
  const projects = [...new Map(data.map(pr=>[pr.repo_id,pr.repo_name])).entries()].sort((a,b)=>a[1].localeCompare(b[1]))
  const needCount = augmented.filter(pr=>pr.state==='open'&&!myVotes.has(pr.id)).length
  const patch = (values: Record<string,string|null>) => {const next=new URLSearchParams(params);Object.entries(values).forEach(([key,value])=>value===null?next.delete(key):next.set(key,value));navigate('/workspace/fixes?'+next.toString(),{replace:true});setClosed(false)}
  const open = (pr: CandidateFix) => {setClosed(false);navigate(fixPath(pr)+(params.size?'?'+params.toString():''),{replace:true})}
  useEffect(()=>{
    if(!preferences.keyboardShortcuts) return
    const handle=(event:KeyboardEvent)=>{
      if(event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || (event.target as HTMLElement)?.closest('input,textarea,select,button,a,[contenteditable=true],[role=dialog],dialog'))return
      if(!['ArrowDown','ArrowUp'].includes(event.key))return
      const next=filtered[selectedIndex+(event.key==='ArrowDown'?1:-1)]
      if(next){event.preventDefault();open(next)}
    }
    document.addEventListener('keydown',handle);return()=>document.removeEventListener('keydown',handle)
  })
  function voted(pr:PanelPR,decision:Decision){
    setRecorded(previous=>new Map(previous).set(pr.id,decision));notify(`Vote recorded on ${pr.repo_name}#${pr.number}`)
    const rest=[...filtered.slice(selectedIndex+1),...filtered.slice(0,Math.max(0,selectedIndex))]
    const next=rest.find(item=>item.id!==pr.id&&item.state==='open'&&!myVotes.has(item.id))
    if(next)open(next);else {setClosed(true);navigate('/workspace/fixes?'+params.toString(),{replace:true})}
  }
  if(loading||authLoading||votes.loading||prefsLoading)return <div className="ws-loading" role="status">Loading candidate fixes…</div>
  if(votes.error)return <div className="ws-error" role="alert">Could not load your votes. <button className="ws-button" onClick={votes.retry}>Retry</button></div>
  const restricted = !bypass && (preferences.hideClosed || (user&&preferences.hideVoted) || preferences.repositories.length>0 || preferences.cwes.length>0 || preferences.minimumSeverity!=='low' || languageFilters.length>0)
  return <>
    <div className="ws-toolbar">
      <label className="ws-search"><Search size={16}/><input type="search" aria-label="Search candidate fixes" placeholder="Search PR #, repo, title, or CWE…" value={query} onChange={e=>patch({q:e.target.value||null})} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();patch({q:null});e.currentTarget.blur()}}}/></label>
      <div className="ws-segmented" aria-label="Candidate fix status">{[...(user?[['mine',`Need my vote (${needCount})`]]:[]),['open','Open'],['trusted','Trusted'],['all','All']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>patch({filter:key})}>{label}</button>)}</div>
      <select aria-label="Project" value={repo} onChange={e=>patch({repo:e.target.value||null})}><option value="">All projects</option>{projects.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
      <div className="ws-segmented" aria-label="Candidate fixes layout">{(['split','table','focus'] as const).map(value=><button key={value} aria-pressed={layout===value} onClick={()=>patch({layout:value})}>{value}</button>)}</div>
    </div>
    <div className="ws-filter-summary"><span>{filtered.length} candidate fixes</span>{restricted ? <span>Filtered by your preferences · <Link to="/workspace/preferences">Edit</Link> · <button className="ws-link" onClick={()=>patch({all:'1'})}>Show all</button></span> : bypass && <button className="ws-link" onClick={()=>patch({all:null})}>Use my preferences</button>}</div>
    {prefsError&&<p className="ws-error">Saved preferences could not be loaded. <Link to="/workspace/preferences">Retry in Preferences</Link></p>}
    {route.repo&&!requested&&<p className="ws-error" role="alert">This candidate fix is not available in the current Workspace collection. <Link to="/workspace/fixes">Return to candidate fixes</Link></p>}
    {!filtered.length&&<div className="ws-empty"><h2>No candidate fixes match</h2><p>{needCount?'Your filters hide available work.':'Nothing needs your vote in this collection.'}</p><button className="ws-button" onClick={()=>patch({q:null,repo:null,all:'1',filter:'all',lang:null,severity:null})}>Clear filters</button></div>}
    {layout==='table' ? <div className="ws-table-scroll"><table className="ws-fix-table"><thead><tr><th>Candidate fix</th>{['severity','status','repo','cwe','updated'].map(key=><th key={key} aria-sort={sort===key?(ascending?'ascending':'descending'):'none'}><button onClick={()=>{setSort(key);setAscending(sort===key?!ascending:key!=='severity')}}>{key}{sort===key?(ascending?' ▲':' ▼'):''}</button></th>)}</tr></thead><tbody>{filtered.map(pr=><tr key={pr.id} className={pr.id===selected?.id?'is-selected':''}><td><button className="ws-title-link" onClick={()=>open(pr)}>{pr.title}</button>{myVotes.has(pr.id)&&<span className={'ws-chip ws-decision--'+myVotes.get(pr.id)}>You voted {myVotes.get(pr.id)}</span>}</td><td><SeverityChip title={pr.title}/></td><td><span className={'ws-chip ws-status--'+fixStatus(pr).toLowerCase().replace(' ','-')}>{fixStatus(pr)}</span></td><td>{pr.repo_name} #{pr.number}</td><td>{finding(pr).cwe||'—'}</td><td><time title={pr.updated_at}>{relativeTime(pr.updated_at)}</time></td></tr>)}</tbody></table></div> : layout==='split' ? <div className="ws-review-grid"><div className="ws-fix-list" aria-label="Candidate fixes">{filtered.map(pr=><button className={'ws-fix-row'+(pr.id===selected?.id?' is-selected':'')} key={pr.id} onClick={()=>open(pr)} aria-current={pr.id===selected?.id?'true':undefined}><strong>{pr.title}</strong><span className="ws-meta">{pr.repo_name} #{pr.number} · {finding(pr).cwe||'Unclassified'} · {relativeTime(pr.updated_at)}</span><span className="ws-chips"><FixChips pr={pr}/>{myVotes.has(pr.id)&&<span className={'ws-chip ws-decision--'+myVotes.get(pr.id)}>You voted {myVotes.get(pr.id)}</span>}</span></button>)}</div><div className="ws-detail-slot"><PRPanel pr={selected??null} presentation="inline" myVotes={myVotes} onClose={()=>setClosed(true)} onVoteSuccess={voted}/>{!selected&&<div className="ws-empty">Choose a candidate fix to begin.</div>}</div></div> : <div className="ws-focus"><div className="ws-focus-controls"><button className="ws-button" disabled={selectedIndex<=0} onClick={()=>open(filtered[selectedIndex-1])}><ChevronLeft size={16}/>Previous</button><span>{selectedIndex<0?0:selectedIndex+1} of {filtered.length}</span><button className="ws-button" disabled={selectedIndex>=filtered.length-1} onClick={()=>open(filtered[selectedIndex+1])}>Next<ChevronRight size={16}/></button></div><PRPanel pr={selected??null} presentation="inline" myVotes={myVotes} onClose={()=>setClosed(true)} onVoteSuccess={voted}/></div>}
    {layout==='table'&&<PRPanel pr={selected??null} myVotes={myVotes} onClose={()=>setClosed(true)} onVoteSuccess={voted}/>}
  </>
}
