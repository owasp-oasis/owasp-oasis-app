import { useState, type ReactNode } from 'react'
import { NavLink, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Inbox, GitPullRequest, Folder, Users, ShieldCheck, Menu } from 'lucide-react'
import { useWorkspaceData } from './useWorkspaceData'
import '../Workspace.css'
export const workspaceLinks = [
  { label: 'My queue', path: '/workspace', icon: Inbox },
  { label: 'Candidate fixes', path: '/workspace/fixes', icon: GitPullRequest },
  { label: 'Projects', path: '/workspace/projects', icon: Folder },
  { label: 'Validators', path: '/workspace/validators', icon: Users },
  { label: 'Maintainers', path: '/workspace/maintainers', icon: ShieldCheck },
  { label: 'Teams', path: '/workspace/teams', icon: Users },
]
export default function WorkspaceLayout({ title, children, queue = false, isPRs = false }: { title: string; children: ReactNode; queue?: boolean; isPRs?: boolean }) {
  const [mobile, setMobile] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { data: status } = useWorkspaceData<{ overall?: { status: string; last_success_at: string } }>('/api/sync/status', {})
  const layout = params.get('layout') ?? 'split'
  const pickLayout = (value: string) => {
    const next = new URLSearchParams(params)
    next.set('layout', value)
    navigate(`/workspace/fixes?${next.toString()}`, { replace: true })
  }
  const eyebrow: Record<string, string> = {
    'My queue': 'OASIS Workspace',
    'Candidate fixes': 'Validate',
    Projects: 'Target repositories',
    Validators: 'Credibility-weighted',
    Maintainers: 'Upstream',
    Teams: 'Coordinate',
    Preferences: 'Account',
    'Sync status': 'Workspace',
  }
  return <div className="workspace ws-v3">
    <aside className={'ws-sidebar' + (mobile ? ' is-open' : '')}>
      <span className="ws-eyebrow">Workspace</span>
      <nav aria-label="Workspace">{workspaceLinks.map(({ label, path, icon: Icon }) => <NavLink key={path} to={path} end={path === '/workspace'} onClick={() => setMobile(false)}><Icon size={16} strokeWidth={1.5} />{label}</NavLink>)}</nav>
      <Link className="ws-sync" to="/workspace/sync"><span className={'ws-dot ws-dot--' + (status.overall?.status ?? 'unknown')} />{status.overall?.status === 'healthy' ? 'Synced' : status.overall?.status ?? 'Sync status'}<span>status</span></Link>
    </aside>
    <div className="ws-main">
      <header className={'ws-screen-header' + (queue ? ' ws-screen-header--queue' : '')}><button className="ws-mobile-toggle ws-button" aria-label="Workspace navigation" aria-expanded={mobile} onClick={() => setMobile(!mobile)}><Menu size={18} /></button><div><span className="ws-eyebrow">{eyebrow[title] ?? 'OASIS Workspace'}</span><h1>{title}</h1></div>{isPRs && <div className="ws-header-layout"><span>Layout</span><div className="ws-layout-switch">{(['split', 'table', 'focus'] as const).map((value, index) => <button key={value} type="button" aria-pressed={layout === value} onClick={() => pickLayout(value)}><b>{`1${String.fromCharCode(97 + index)}`}</b>{value[0].toUpperCase() + value.slice(1)}</button>)}</div></div>}</header>
      <div className="ws-content">{children}</div>
    </div>
  </div>
}
