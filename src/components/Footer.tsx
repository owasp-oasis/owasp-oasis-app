import { NavLink } from 'react-router-dom'
import './Footer.css'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <div className="footer-brand-logo">
            <img src="/logo/oasis-wordmark.svg" alt="OASIS" height={28} />
          </div>
          <p className="footer-tagline">
            Open source powers the world.<br />
            Vibe hacking exploits it.<br />
            Team OASIS fixes it.
          </p>
        </div>

        <nav className="footer-links" aria-label="Footer navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/overview">Overview</NavLink>
          <NavLink to="/leaderboards">Leaderboards</NavLink>
          <NavLink to="/sponsors">Sponsors</NavLink>
        </nav>

        <div className="footer-external">
          <a href="https://github.com/owasp-oasis/project-overview" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a href="https://owasp.org" target="_blank" rel="noopener noreferrer">OWASP</a>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="container">
          <span>OASIS — A proposed OWASP project. &copy; {new Date().getFullYear()}</span>
          <span className="footer-legal">Vendor-neutral. Community-driven. Open source.</span>
        </div>
      </div>
    </footer>
  )
}
