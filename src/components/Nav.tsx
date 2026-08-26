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
  { to: '/news', label: 'News', exact: false },
]

interface NavProps {
  onOpenOnboarding?: () => void
}

export default function Nav({ onOpenOnboarding }: NavProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const { user, loading, logout } = useAuth()

  // Close open navigation surfaces on outside click.
  useEffect(() => {
    if (!menuOpen && !accountOpen) return
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setAccountOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, accountOpen])

  // Close open navigation surfaces on Escape.
  useEffect(() => {
    if (!menuOpen && !accountOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setAccountOpen(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [menuOpen, accountOpen])

  function closeMenu() {
    setMenuOpen(false)
    setAccountOpen(false)
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
              <button
                type="button"
                className="nav-account-trigger"
                onClick={() => {
                  setAccountOpen(open => !open)
                  setMenuOpen(false)
                }}
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                aria-controls="nav-account-menu"
              >
                <img
                  src={user.avatar_url ?? `https://github.com/${user.login}.png?size=28`}
                  alt=""
                  className="nav-auth-avatar"
                  width={28}
                  height={28}
                />
                <span className="nav-account-login">@{user.login}</span>
                <svg
                  className="nav-account-chevron"
                  aria-hidden="true"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                >
                  <path d="m3 4.5 3 3 3-3" />
                </svg>
              </button>

              {accountOpen && (
                <div id="nav-account-menu" className="nav-account-menu" role="menu">
                  <button
                    type="button"
                    className="nav-account-action"
                    role="menuitem"
                    onClick={() => { onOpenOnboarding?.(); closeMenu() }}
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M2 4h4m4 0h4M8 2v4M2 8h7m4 0h1m-3-2v4M2 12h2m4 0h6M6 10v4" />
                    </svg>
                    Preferences
                  </button>
                  <button
                    type="button"
                    className="nav-account-action nav-account-action--signout"
                    role="menuitem"
                    onClick={() => { void logout(); closeMenu() }}
                  >
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M6 3H3v10h3M10 5l3 3-3 3M13 8H6" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
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
          onClick={() => {
            setMenuOpen(open => !open)
            setAccountOpen(false)
          }}
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
