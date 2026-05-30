import { useState, useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import './Nav.css'

const links = [
  { to: '/', label: 'Home', exact: true },
  { to: '/about', label: 'About', exact: false },
  { to: '/overview', label: 'Overview', exact: false },
  { to: '/leaderboards', label: 'Leaderboards', exact: false },
  { to: '/support', label: 'Support', exact: false },
  { to: '/sponsors', label: 'Sponsors', exact: false },
]

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

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

        <a href="/#register-form" className="nav-cta btn btn-primary" onClick={closeMenu}>
          Join Team OASIS
        </a>

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
