import { NavLink } from 'react-router-dom'
import './Nav.css'

const links = [
  { to: '/', label: 'Home', exact: true },
  { to: '/about', label: 'About', exact: false },
  { to: '/overview', label: 'Overview', exact: false },
  { to: '/leaderboards', label: 'Leaderboards', exact: false },
  { to: '/sponsors', label: 'Sponsors', exact: false },
]

export default function Nav() {
  return (
    <header className="nav">
      <div className="nav-inner container">
        <NavLink to="/" className="nav-logo" aria-label="OASIS Home">
          <img src="/logo/oasis-wordmark.svg" alt="OASIS" height={36} />
        </NavLink>
        <nav className="nav-links" aria-label="Main navigation">
          {links.map(({ to, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                isActive ? 'nav-link nav-link--active' : 'nav-link'
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <a href="/#register-form" className="nav-cta btn btn-primary">
          Join Team OASIS
        </a>
      </div>
    </header>
  )
}
