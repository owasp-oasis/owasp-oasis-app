import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Nav.css'

const links = [
  { to: '/', label: 'Home', exact: true },
  { to: '/about', label: 'About', exact: false },
  { to: '/overview', label: 'Overview', exact: false },
  { to: '/workspace', label: 'Workspace', exact: false },
  { to: '/support', label: 'Support', exact: false },
  { to: '/sponsors', label: 'Sponsors', exact: false },
]

interface NavProps {
  onOpenOnboarding?: () => void
}

export default function Nav({ onOpenOnboarding }: NavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const { user, loading, logout } = useAuth()

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header className="nav" ref={navRef}>
      <div className="nav-inner container">
        <NavLink to="/" className="nav-logo" aria-label="OASIS Home" onClick={closeMenu}>
          <img src="/logo/oasis-wordmark.svg" alt="OASIS" height={36} />
        </NavLink>

        <nav
          className={`nav-links${menuOpen ? ' nav-links--open' : ''}`}
          aria-label="Main navigation"
        >
          {links.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
              onClick={closeMenu}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Auth widget */}
        {!loading && (
          user ? (
            <div className="nav-auth">
              <img
                src={user.avatar_url ?? `https://github.com/${user.login}.png?size=28`}
                alt={user.login}
                className="nav-auth-avatar"
                width={28}
                height={28}
              />
              <span className="nav-auth-login">@{user.login}</span>
              <button
                type="button"
                className="nav-auth-btn"
                onClick={() => { onOpenOnboarding?.(); closeMenu() }}
                title="Update your preferences"
                aria-label="Update Workspace preferences"
              >
                <svg
                  className="nav-auth-btn-icon"
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M2 4h4m4 0h4M8 2v4M2 8h7m4 0h1m-3-2v4M2 12h2m4 0h6M6 10v4" />
                </svg>
                <span className="nav-auth-btn-label">Preferences</span>
              </button>
              <button
                className="nav-auth-signout"
                onClick={() => { logout(); closeMenu() }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <a href="/api/auth/login" className="nav-auth nav-auth-signin">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
              Sign in
            </a>
          )
        )}

        {!user && (
          <a href="/#register-form" className="nav-cta btn btn-primary" onClick={closeMenu}>
            Join Team OASIS
          </a>
        )}

        <button
          className={`nav-hamburger${menuOpen ? ' nav-hamburger--open' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="nav-links"
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
