import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { WORKSPACE_DEFAULTS, type WorkspacePreferences } from '../../workspacePreferences'
import { useWorkspaceData } from './useWorkspaceData'
import { finding, type CandidateFix } from './fixModel'
export default function Preferences() {
  const { user } = useAuth()
  const { preferences, save, loading, saving, error, retry } = useWorkspace()
  const repos = useWorkspaceData<{ id: number; name: string; language: string }[]>(user ? '/api/workspace/repos' : null, [])
  const fixes = useWorkspaceData<CandidateFix[]>(user ? '/api/workspace/prs' : null, [])
  const [repoQuery, setRepoQuery] = useState('')
  const [cweQuery, setCweQuery] = useState('')
  const change = (patch: Partial<WorkspacePreferences>) => { void save(patch).catch(() => {}) }
  if (!user) return <div className="ws-empty"><h2>Make this Workspace yours</h2><p>Sign in to save your repositories, review filters, and display preferences.</p><a className="ws-button ws-button--primary" href="/api/auth/login">Sign in with GitHub</a></div>
  const cwes = [...new Map(fixes.data.map(pr => { const f = finding(pr); return [f.cwe, f] })).values()].filter(f=>f.cwe)
  // Keep selections visible even when the repository is no longer in the active directory.
  const allRepos = [...repos.data, ...preferences.repositories.filter(id=>!repos.data.some(r=>r.id===id)).map(id=>({id,name:'Repository #' + id, language:''}))]
  const allCwes = [...cwes, ...preferences.cwes.filter(cwe=>!cwes.some(f=>f.cwe===cwe)).map(cwe=>({cwe,cweName:'',severity:'unknown'}))]
  return <div className="ws-preferences">
    <section className="ws-card ws-profile-card"><div className="ws-profile-avatar">{user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.login.slice(0,2).toUpperCase()}</div><div><h2>{user.login}</h2><p>Signed in with GitHub · avatar and name sync from your GitHub profile</p></div><a href="https://github.com/settings/profile" target="_blank" rel="noreferrer">Edit on GitHub ↗</a></section>
    <div className="ws-preference-summary"><span>⌕</span>{fixes.data.filter(pr=>pr.state==='open').length} open candidate fixes match your preferences, {fixes.data.filter(pr=>pr.state==='open'&&!preferences.repositories.length).length} still need your vote.<Link className="ws-button ws-button--primary" to="/workspace/fixes">View matching fixes</Link></div>
    {error && <div className="ws-error" role="alert">{error} <button className="ws-button" onClick={retry}>Retry loading preferences</button><p>Your last change was not confirmed. Retry it after loading.</p></div>}
    {(loading || saving) && <p role="status">{loading ? 'Loading preferences…' : 'Saving preferences…'}</p>}
    <fieldset disabled={loading || saving || !!error}>
      <section className="ws-card ws-preference-card"><header><div><h2>Watched repositories</h2><p>Only fixes for these projects appear in your queue and in Candidate fixes when your preferences are on.</p></div><div className="ws-actions"><button className="ws-link" type="button" onClick={()=>change({repositories:allRepos.map(r=>r.id)})}>Select all</button><button className="ws-link" type="button" onClick={()=>change({repositories:[]})}>Clear</button></div></header><div className="ws-preference-search"><input aria-label="Search repositories" type="search" placeholder="Search repositories or languages…" value={repoQuery} onChange={e=>setRepoQuery(e.target.value)} /><small>{preferences.repositories.length} of {allRepos.length} watched</small></div>
      {repos.error ? <p role="alert">{repos.error} <button type="button" onClick={repos.retry}>Retry</button></p> : repos.loading ? <p role="status">Loading repositories…</p> : <div className="ws-choice-list">{allRepos.filter(r=>(r.name+' '+r.language).toLowerCase().includes(repoQuery.toLowerCase())).sort((a,b)=>Number(preferences.repositories.includes(b.id))-Number(preferences.repositories.includes(a.id))||a.name.localeCompare(b.name)).map(repo=><label className="ws-choice-tile" key={repo.id}><input type="checkbox" checked={preferences.repositories.includes(repo.id)} onChange={e=>change({repositories:e.target.checked?[...preferences.repositories,repo.id]:preferences.repositories.filter(id=>id!==repo.id)})}/><span><b>{repo.name}</b><small>{repo.language}</small></span></label>)}</div>}</section>
      <section className="ws-card ws-preference-card"><header><div><h2>Vulnerability classes</h2><p>Pick the CWE classes you’re comfortable validating.</p></div><div className="ws-actions"><button className="ws-link" type="button" onClick={()=>change({cwes:allCwes.map(c=>c.cwe)})}>Select all</button><button className="ws-link" type="button" onClick={()=>change({cwes:[]})}>Clear</button></div></header><div className="ws-preference-search"><input aria-label="Search CWE classes" type="search" placeholder="Search by CWE number or name…" value={cweQuery} onChange={e=>setCweQuery(e.target.value)} /><small>{preferences.cwes.length} of {allCwes.length} selected</small></div>{fixes.error ? <p role="alert">{fixes.error} <button type="button" onClick={fixes.retry}>Retry</button></p> : <div className="ws-choice-list ws-cwe-list">{allCwes.filter(f=>(f.cwe+' '+f.cweName).toLowerCase().includes(cweQuery.toLowerCase())).sort((a,b)=>Number(preferences.cwes.includes(b.cwe))-Number(preferences.cwes.includes(a.cwe))||a.cwe.localeCompare(b.cwe)).map(f=><label className="ws-choice-tile" key={f.cwe}><input type="checkbox" checked={preferences.cwes.includes(f.cwe)} onChange={e=>change({cwes:e.target.checked?[...preferences.cwes,f.cwe]:preferences.cwes.filter(c=>c!==f.cwe)})}/><span><b>{f.cwe}</b> {f.cweName}</span></label>)}{!allCwes.length && <p>No classified candidate fixes are available yet.</p>}</div>}</section>
      <section className="ws-card ws-preference-card"><h2>Minimum severity</h2><div className="ws-segmented">{([['low','All'],['medium','Medium+'],['high','High+'],['critical','Critical only']] as const).map(([v,label])=><button type="button" key={v} aria-pressed={preferences.minimumSeverity===v} onClick={()=>change({minimumSeverity:v})}>{label}</button>)}</div></section>
      <section className="ws-card ws-preference-card"><h2>Review defaults</h2>{([['hideClosed','Hide closed fixes'],['hideVoted',"Hide fixes I’ve already voted on"],['keyboardShortcuts','Keyboard shortcuts']] as const).map(([key,label])=><label className="ws-check-row" key={key}><input type="checkbox" checked={preferences[key]} onChange={e=>change({[key]:e.target.checked})}/>{label}</label>)}</section>
      <section className="ws-card ws-preference-card"><h2>Candidate fixes layout</h2><div className="ws-segmented">{(['split','table','focus'] as const).map(v=><button type="button" key={v} aria-pressed={preferences.layout===v} onClick={()=>change({layout:v})}>{v}</button>)}</div></section>
      <section className="ws-card ws-preference-card"><h2>Diff view</h2><div className="ws-segmented">{(['split','unified'] as const).map(v=><button type="button" key={v} aria-pressed={preferences.diffView===v} onClick={()=>change({diffView:v})}>{v}</button>)}</div></section>
      <button className="ws-button" type="button" onClick={()=>change(WORKSPACE_DEFAULTS)}>Reset to defaults</button>
    </fieldset>
  </div>
}
