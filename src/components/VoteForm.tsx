import { useState, useEffect, type FormEvent } from 'react'
import { useAuth } from '../context/AuthContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { teamGet, errorMessage } from '../pages/workspace/teamApi'
import './VoteModal.css'
export type Decision = 'accept' | 'modify' | 'reject' | 'duplicate'
export interface VoteFormPR { id: number; repo_name: string; number: number; title: string }
interface Props { pr: VoteFormPR; initialDecision: Decision; onClose: () => void; onSuccess: (decision: Decision) => void; onDecisionChange?: (decision: Decision) => void; onSubmittingChange?: (busy: boolean) => void }
interface Draft { confidence: string; comments: string; nextStep: string; blocking: string; reconsider: string; parent: string; team: string }
const blank: Draft = { confidence: 'Medium', comments: '', nextStep: 'Merge', blocking: '', reconsider: '', parent: '', team: '' }
// Ephemeral and scoped to the signed-in account. Never written to analytics or disk.
const drafts = new Map<string, Draft>()
export const clearVoteDrafts = () => drafts.clear()
export default function VoteForm({pr,initialDecision,onClose,onSuccess,onDecisionChange,onSubmittingChange}:Props) {
  const { user } = useAuth()
  const { preferences } = useWorkspace()
  const key = `${user?.login}:${pr.id}`
  const [draft,setDraft]=useState<Draft>(()=>drafts.get(key)??{...blank})
  const [decision,setDecision]=useState(initialDecision)
  const [teams,setTeams]=useState<{id:number;name:string;status:string}[]>([])
  const [teamsError,setTeamsError]=useState<string|null>(null)
  const [token,setToken]=useState<string|null>(null)
  const [submitting,setSubmitting]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const [retry,setRetry]=useState(0)
  useEffect(()=>setDecision(initialDecision),[initialDecision])
  useEffect(()=>{drafts.set(key,draft)},[key,draft])
  useEffect(()=>{
    const controller=new AbortController()
    void teamGet<{token:string}>('/api/csrf',controller.signal).then(r=>setToken(r.token)).catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e))})
    setTeamsError(null)
    void teamGet<{teams:typeof teams}>('/api/teams/mine',controller.signal).then(r=>setTeams(r.teams.filter(t=>t.status==='active'))).catch(e=>{if(!controller.signal.aborted)setTeamsError(errorMessage(e))})
    return()=>controller.abort()
  },[retry])
  const change=(patch:Partial<Draft>)=>setDraft(previous=>({...previous,...patch}))
  const valid=draft.comments.trim().length>0&&(decision!=='duplicate'||(/^\d+$/.test(draft.parent)&&Number(draft.parent)>0&&Number(draft.parent)!==pr.number))
  async function submit(event:FormEvent){
    event.preventDefault();if(submitting||!valid||!token)return
    setSubmitting(true);onSubmittingChange?.(true);setError(null)
    try {
      const body:Record<string,unknown>={pr_id:pr.id,decision}
      if(draft.team)body.team_id=Number(draft.team)
      if(decision==='duplicate'){body.parent_pr_number=Number(draft.parent);body.notes=draft.comments}
      else if(decision==='reject'){body.summary=draft.comments;body.blocking_issues=draft.blocking;body.to_reconsider=draft.reconsider}
      else {body.confidence=draft.confidence;body.summary=draft.comments;body.next_step=draft.nextStep}
      const response=await fetch('/api/vote',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-csrf-token':token},body:JSON.stringify(body)})
      const result=await response.json() as {ok:boolean;error?:string}
      if(!response.ok||!result.ok)throw new Error(result.error??'The vote could not be recorded. Please try again.')
      drafts.delete(key);onSuccess(decision)
    }catch(e){setError(errorMessage(e))}finally{setSubmitting(false);onSubmittingChange?.(false)}
  }
  return <form className="vm-form" onSubmit={submit} onKeyDown={e=>{if(preferences.keyboardShortcuts&&(e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();e.currentTarget.requestSubmit()}}}>
    <fieldset disabled={submitting}>
      <div className="vm-field"><label className="vm-label" htmlFor="vf-team">Credit this validation</label><select id="vf-team" className="vm-input" value={draft.team} onChange={e=>change({team:e.target.value})}><option value="">Personal only</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><p className="vm-help">Your work stays yours. Team credit is locked when you submit.</p>{teamsError&&<p className="vm-error" role="alert">Teams could not be loaded. <button type="button" onClick={()=>setRetry(n=>n+1)}>Retry</button></p>}</div>
      <div className="vm-decision-group" aria-label="Decision">{(['accept','modify','reject','duplicate'] as const).map(d=><button key={d} type="button" aria-pressed={decision===d} className={`vm-decision-btn vm-decision-btn--${d}${decision===d?' vm-decision-btn--active':''}`} onClick={()=>{setDecision(d);onDecisionChange?.(d)}}>{d[0].toUpperCase()+d.slice(1)}</button>)}</div>
      {(decision==='accept'||decision==='modify')&&<><div className="vm-field"><span className="vm-label">Confidence</span><div className="ws-segmented" aria-label="Confidence">{['Low','Medium','High'].map(c=><button key={c} type="button" aria-pressed={draft.confidence===c} onClick={()=>change({confidence:c})}>{c}</button>)}</div></div><div className="vm-field"><label className="vm-label" htmlFor="vf-next">Recommended action</label><select id="vf-next" className="vm-input" value={draft.nextStep} onChange={e=>change({nextStep:e.target.value})}>{['Merge','Revise','Re-review','Close'].map(n=><option key={n}>{n}</option>)}</select></div></>}
      <div className="vm-field"><label className="vm-label" htmlFor="vf-comments">Comments <span className="vm-required">*</span></label><textarea id="vf-comments" className="vm-textarea" required rows={3} maxLength={2000} value={draft.comments} onChange={e=>change({comments:e.target.value})} placeholder="Explain your assessment and what should happen next…" /></div>
      {decision==='duplicate'&&<div className="vm-field"><label className="vm-label" htmlFor="vf-parent">Parent PR number <span className="vm-required">*</span></label><input id="vf-parent" type="number" className="vm-input" required min={1} step={1} value={draft.parent} onChange={e=>change({parent:e.target.value})}/><p className="vm-help">Required for Duplicate. Choose a different PR in this repository.</p></div>}
      {decision==='reject'&&<details><summary>Additional context</summary><div className="vm-field"><label className="vm-label" htmlFor="vf-blocking">Blocking issues</label><input id="vf-blocking" className="vm-input" value={draft.blocking} maxLength={500} onChange={e=>change({blocking:e.target.value})}/></div><div className="vm-field"><label className="vm-label" htmlFor="vf-reconsider">To reconsider</label><input id="vf-reconsider" className="vm-input" maxLength={500} value={draft.reconsider} onChange={e=>change({reconsider:e.target.value})}/></div></details>}
      {error&&<p className="vm-error" role="alert">{error} {!token&&<button type="button" onClick={()=>{setError(null);setRetry(n=>n+1)}}>Retry</button>}</p>}
      {!valid&&<p className="vm-help">Add comments{decision==='duplicate'?' and a valid parent PR number':''} to submit.</p>}
      <div className="vm-footer"><button className="ws-button ws-button--primary" disabled={!valid||!token||submitting}>{submitting?'Submitting…':'Submit vote'}</button><button type="button" className="ws-button" onClick={onClose}>Cancel</button></div><p className="vm-disclaimer">Submitting posts your assessment as a GitHub comment using your account.</p>
    </fieldset>
  </form>
}
