import { Link } from 'react-router-dom'
import './NewsLaunch.css'

// TODO Aug 26 at 8:00 AM EST: Replace WIRE_LINK with the live Business Wire URL once Ben confirms it is live
const WIRE_LINK = ''

export default function NewsLaunch() {
  return (
    <div className="news-article">
      <div className="page-hero news-article-hero">
        <div className="container">
          <Link to="/news" className="news-back">&#8592; News &amp; Announcements</Link>
          <span className="badge badge-blue">Press Release</span>
          <h1>OWASP OASIS Launches as Official OWASP Community Project</h1>
          <p className="news-article-meta">August 26, 2026 &middot; OWASP OASIS Founding Team</p>
        </div>
      </div>

      <section className="section">
        <div className="container news-article-body">
          <p>
            Today, OWASP OASIS officially launched as an OWASP project. This community is now open.
          </p>
          <p>
            Open source underlies nearly every layer of modern digital infrastructure. The security
            industry got very good at finding vulnerabilities. Fixing them has been a different
            story. Millions of known CVEs in widely used open source packages remain unpatched —
            while AI-assisted attacks exploit them at a speed no individual maintainer team can
            absorb. There was no organized mechanism to generate and validate fixes at the same
            speed vulnerabilities are found. OWASP OASIS is that mechanism.
          </p>

          <h2>How the community works</h2>
          <p>
            Vendors donate AI-powered fix automation tooling. The community does the work that
            makes those fixes trustworthy. A community of AppSec professionals and open source
            champions reviews each candidate fix and submits validated fixes upstream to maintainers
            as credible, community-reviewed patches they can trust and merge at their discretion.
          </p>

          <h2>This community is for you</h2>
          <p>
            Anyone with an enthusiasm for security or software experience belongs here. Experienced
            AppSec professionals — security engineers, product security leads, developers in
            security-sensitive codebases — bring the most immediate value. Newer practitioners
            build real, hands-on AppSec skills by working alongside them on real vulnerabilities.
            OWASP OASIS is an incredible learning resource. There are many non-technical roles
            to play.
          </p>
          <p>
            Participation is free. Every validation is a verified, public contribution to the
            security of open source software the world depends on.
          </p>

          <h2>Founding members</h2>
          <p>
            OWASP OASIS was initiated by AppSecAI, Intigriti, and DryRun Security. The project
            is vendor-neutral and open to additional sponsors and partners.
          </p>

          <div className="news-article-cta">
            {WIRE_LINK
              ? <p>Read the full press release: <a href={WIRE_LINK} target="_blank" rel="noopener noreferrer">Business Wire</a></p>
              : null
            }
            <p>Register at <a href="https://owasp-oasis.org">owasp-oasis.org</a>. Takes 30 seconds.</p>
          </div>
        </div>
      </section>
    </div>
  )
}
