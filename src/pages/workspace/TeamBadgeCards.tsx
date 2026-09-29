import { Award, Users } from 'lucide-react'
import type { TeamBadge } from './teamApi'
export default function TeamBadgeCards({badges,count,threshold}:{badges:TeamBadge[];count:number;threshold:number}) {
  const member=badges.find(b=>b.badge_key==='membership')
  const contribution=badges.find(b=>b.badge_key==='contributor_milestone')
  return <div className="team-v3-badges">{([{key:'member',title:'Team member',badge:member,Icon:Users,description:'Recognition for joining this team.'},{key:'contributor',title:'Team contributor',badge:contribution,Icon:Award,description:'Recognition for validations credited to this team.'}]).map(({key,title,badge,Icon,description})=><section className={'team-v3-badge'+(badge?' is-earned':'')} key={key}><Icon size={24}/><div><div className="team-v3-badge-heading"><h4>{title}</h4><span className="ws-chip">{badge?'Earned':'In progress'}</span></div><p>{description}</p>{key==='contributor'&&<>{badge?<p>Earned at the {badge.threshold}-validation bar.{badge.threshold!==threshold?' Your badge is retained when the bar changes.':''}</p>:<><p>{count} of {threshold} attributed validations</p><progress value={Math.min(count,threshold)} max={threshold} aria-label="Team contributor progress"/></>}</>}{badge&&<time dateTime={badge.awarded_at}>Earned {new Date(badge.awarded_at).toLocaleDateString()}</time>}</div></section>)}</div>
}
