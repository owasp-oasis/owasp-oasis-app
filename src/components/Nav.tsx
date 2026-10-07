import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, Settings2, Activity, LogOut, Shield, ChartNoAxesCombined } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import './Nav.css'
const links = [ ['/', 'Home'], ['/overview', 'Overview'], ['/workspace', 'Workspace'], ['/support', 'Support'], ['/sponsors', 'Sponsors'], ['/news', 'News & Events'], ['/about', 'About'] ]
export default function Nav(_props: { onOpenOnboarding?: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [profile, setProfile] = useState<{ rank: number | null; reputation: number } | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const accountRef = useRef<HTMLButtonElement>(null)
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const close = useCallback(() => { setMenuOpen(false); setAccountOpen(false) }, [])
  useEffect(() => close(), [location.pathname, close])
  useEffect(() => setAvatarFailed(false), [user?.login])
  useEffect(() => {
    setProfile(null)
    if (!user) return
    const controller = new AbortController()
    void fetch('/api/contributors/' + encodeURIComponent(user.login), { signal: controller.signal, credentials: 'include', cache: 'no-store' })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (!data?.contributor) return
        setProfile({ rank: data.contributor.rank_90d ?? data.allTimeRank ?? null, reputation: Number(data.contributor.modified_reputation ?? 0) })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [user?.login])
  useEffect(() => {
    if (!accountOpen && !menuOpen) return
    const outside = (e: MouseEvent) => { if (!navRef.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); accountRef.current?.focus() }
      if (accountOpen && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        const items = Array.from(navRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
        const index = items.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        e.preventDefault(); items[next]?.focus()
      }
    }
    document.addEventListener('mousedown', outside); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', key) }
  }, [accountOpen, menuOpen, close])
  return <header className="nav" ref={navRef}>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="nav-inner">
      <NavLink to="/" className="nav-logo" aria-label="OASIS Home" onClick={close}><img src="/logo/oasis-wordmark.svg" alt="OASIS" height={36} /></NavLink>
      <nav id="nav-links" className={'nav-links' + (menuOpen ? ' nav-links--open' : '')} aria-label="Main navigation">{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => 'nav-link' + (isActive ? ' nav-link--active' : '')} onClick={close}>{label}</NavLink>)}</nav>
      {!loading && (user ? <div className="nav-auth">
        <button ref={accountRef} className="nav-account-trigger" aria-label={'Account @' + user.login} aria-haspopup="menu" aria-expanded={accountOpen} aria-controls="nav-account-menu" onClick={() => { setAccountOpen(!accountOpen); setMenuOpen(false) }}>
          {avatarFailed ? <span className="nav-avatar-fallback">{user.login.slice(0, 2).toUpperCase()}</span> : <img src={user.avatar_url ?? `https://github.com/${user.login}.png?size=56`} alt="" className="nav-auth-avatar" width={28} height={28} onError={() => setAvatarFailed(true)} />}
          <span className="nav-account-login">@{user.login}</span><ChevronDown size={12} />
        </button>
        {accountOpen && <div id="nav-account-menu" className="nav-account-menu" role="menu" aria-label="Account">
          <div className="nav-account-header"><strong>@{user.login}</strong><span>{profile ? `Validator · Rank ${profile.rank ? '#' + profile.rank : '—'} · ${profile.reputation.toFixed(1)} rep` : 'Validator'}</span></div>
          <NavLink to="/workspace/preferences" role="menuitem" onClick={close}><Settings2 size={16} />Preferences</NavLink>
          <NavLink to="/workspace/sync" role="menuitem" onClick={close}><Activity size={16} />Sync status</NavLink>
          {user.role === 'admin' && <><NavLink to="/admin" role="menuitem" onClick={close}><Shield size={16} />User access</NavLink><NavLink to="/admin/analytics" role="menuitem" onClick={close}><ChartNoAxesCombined size={16} />Analytics</NavLink></>}
          <hr /><button role="menuitem" onClick={() => { void logout(); close() }}><LogOut size={16} />Sign out</button>
        </div>}
      </div> : <><a href="/api/auth/login" className="nav-signin">Sign in</a><a href="/#register-form" className="nav-cta">Join Team OASIS</a></>)}
      <button className={'nav-hamburger' + (menuOpen ? ' nav-hamburger--open' : '')} onClick={() => { setMenuOpen(!menuOpen); setAccountOpen(false) }} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="nav-links"><span /><span /><span /></button>
    </div>
  </header>
}
