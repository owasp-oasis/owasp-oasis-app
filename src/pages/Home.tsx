import RegisterForm from '../components/RegisterForm'
import QuotesCarousel from '../components/QuotesCarousel'
import type { Quote } from '../components/QuotesCarousel'
import './Home.css'

// TODO: Replace with third-party quotes — these are placeholder quotes from OASIS co-founders
const quotes: Quote[] = [
  {
    name: 'Chris Holt',
    title: 'Community Architect',
    company: 'Intigriti',
    quote: 'It feels good to do good. OASIS is an opportunity for every hacker, developer, and security-interested practitioner to move the needle on securing open-source code. AI finally enables fixing vulnerabilities at the speed of compute, but we need to build trust in the tools first.',
    photoUrl: '/headshots/chris-holt.jpeg',
    linkedinUrl: 'https://www.linkedin.com/in/flyingtoasters/',
  },
  {
    name: 'Michael Cartsonis',
    title: 'Co-Founder, VP of Product',
    company: 'AppSecAI',
    quote: "For the past 3 years, I've been building AI tools to enable developers and appsec teams to remediate at the speed of compute. OASIS takes that concept to the masses to showcase the power of AI to remediate vulnerabilities, and truly left-shift security up the supply chain.",
    photoUrl: '/headshots/michael-cartsonis.jpeg',
    linkedinUrl: 'https://www.linkedin.com/in/cartsoni/',
  },
  {
    name: 'Aaron Birnbaum',
    title: 'Co-founder & Chief Security Officer',
    company: 'Seron Security',
    quote: "Great to see OASIS officially accepted into OWASP. The increase in AI-accelerated attacks on open source software is alarming. From poisoned packages, automated dependency abuse, and over-extended security teams makes this one of the fastest-growing blind spots in modern security programs. A vendor-neutral, community-driven standard for defending the ecosystem is long overdue. So much of an organization's real exposure now lives in its open-source dependencies, so a project like this strengthens the whole chain. Congratulations to the team and to the validators making it happen — happy to contribute where useful.",
    photoUrl: '/headshots/aaron-birnbaum.jpeg',
    linkedinUrl: 'https://www.linkedin.com/in/aaron-s-birnbaum/',
  }
]

const ShieldSVG = () => (
  <svg viewBox="0 0 256 256" aria-hidden="true" className="shield-svg">
    <g transform="translate(-19.2,-10) scale(1.15)">
      <path d="M128 20 L56 44 V120 C56 166 86 204 128 220 C170 204 200 166 200 120 V44 Z" fill="#0B4F8A" stroke="#0B4F8A" strokeWidth="4" strokeLinejoin="round"/>
      <path d="M128 36 L72 56 V118 C72 156 96 188 128 200 C160 188 184 156 184 118 V56 Z" fill="#0F6FCF"/>
      <circle cx="128" cy="120" r="40" fill="#fff"/>
      <circle cx="128" cy="120" r="25" fill="#0F6FCF"/>
      <line x1="96" y1="80" x2="80" y2="60" stroke="#4CD964" strokeWidth="6" strokeLinecap="round"/>
      <circle cx="80" cy="60" r="5" fill="#4CD964"/>
      <line x1="128" y1="72" x2="128" y2="48" stroke="#4CD964" strokeWidth="6" strokeLinecap="round"/>
      <circle cx="128" cy="48" r="5" fill="#4CD964"/>
      <line x1="160" y1="80" x2="176" y2="60" stroke="#4CD964" strokeWidth="6" strokeLinecap="round"/>
      <circle cx="176" cy="60" r="5" fill="#4CD964"/>
    </g>
  </svg>
)

const steps = [
  {
    n: '01',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-5"/></svg>
    ),
    iconColor: 'blue',
    title: 'Generate candidate fixes',
    body: 'Fix automation tools produce candidate patches for known vulnerabilities in open source repositories.',
  },
  {
    n: '02',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
    ),
    iconColor: 'green',
    title: 'Validate with humans',
    body: 'AppSec experts review the vulnerability and the proposed fix, separating credible signal from AI-generated noise.',
  },
  {
    n: '03',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10v10"/><path d="M7 17 17 7"/><path d="M5 21h14"/></svg>
    ),
    iconColor: 'blue',
    title: 'Advance upstream',
    body: 'Maintainers receive vetted security signal while keeping full control over what fits and what merges.',
  },
]

const beliefs = [
  { title: 'Open culture', body: 'Security contribution should feel like a natural part of open source contribution, not an outside process imposed on maintainers.' },
  { title: 'Human judgment', body: 'Automation can move fast, but expert validators decide which fixes are real, credible, and useful.' },
  { title: 'Small actions', body: 'OASIS turns security expertise into focused validation work that can be done in minutes, without owning the whole remediation workflow.' },
  { title: 'Shared trust', body: 'Community standards make the process auditable and help maintainers receive signal instead of unvetted AI slop.' },
]

const reasons = [
  {
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    title: 'Impact',
    body: 'Help fix the open source that runs modern software, business, infrastructure, and the global economy.',
  },
  {
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    title: 'Community',
    body: 'Join validators, project owners, and maintainers building a cooperative model for open source security.',
    green: true,
  },
  {
    icon: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4v15.5"/><path d="M20 22V6a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 6.5"/></svg>,
    title: 'Learning',
    body: 'Work with real vulnerabilities, real candidate fixes, and real validation patterns alongside other experts.',
  },
]

export default function Home() {
  return (
    <div className="home">
      <a className="skip-link" href="#register-form">Skip to registration</a>

      {/* ── Hero ── */}
      <section className="home-hero">
        <div className="wrap home-hero-grid">
          {/* Left: headline + actions + ethos strip */}
          <div className="home-hero-left">
            <div className="home-kicker">Official OWASP Project!</div>
            <h1 className="home-headline">
              <span className="line-open">Open source powers the world.</span>
              <span className="line-threat">Vibe hacking exploits it.</span>
              <span className="line-fix">Team OASIS fixes it.</span>
            </h1>
            <p className="home-lede">
              OASIS (Open Automated Security Initiative for Software) mobilizes the AppSec community to
              deliver community-validated vulnerability fixes for the open source software that runs the world.
            </p>
            <div className="home-actions">
              <a className="btn btn-secondary" href="#register-form">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-icon"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
                Join Team OASIS
              </a>
              <a className="btn home-btn-outline" href="#how">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-icon"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                See the model
              </a>
            </div>

            {/* Ethos strip */}
            <div className="ethos-strip" aria-label="OASIS operating principles">
              <div className="ethos-item"><b>Urgency</b><span>AI threats are exploiting open source faster than any one team can respond.</span></div>
              <div className="ethos-item"><b>Agency</b><span>Security professionals can apply their expertise directly to software everyone uses.</span></div>
              <div className="ethos-item"><b>Trust</b><span>Community validation delivers trusted fixes, not AI noise, to the open source community.</span></div>
              <div className="ethos-item"><b>Community</b><span>Maintainers, validators, and project owners cooperate in the open.</span></div>
            </div>
          </div>

          {/* Right: registration card */}
          <aside className="home-register-card" id="register-form" aria-labelledby="register-title">
            <div className="home-register-head">
              <ShieldSVG />
              <div>
                <h2 id="register-title">Sign Up Now!</h2>
                <p>Help make OWASP-OASIS a reality.</p>
              </div>
            </div>
            <RegisterForm type="validator" />
          </aside>
        </div>
      </section>

      {/* ── Quotes carousel ── */}
      <QuotesCarousel quotes={quotes} />

      {/* ── How it works ── */}
      <section className="home-section" id="how">
        <div className="wrap">
          <div className="home-section-head">
            <div>
              <div className="home-eyebrow">The mechanism</div>
              <h2>AI brings speed. You bring expertise.</h2>
            </div>
            <p className="home-section-intro">
              OASIS is the community validation layer between fix automation and upstream maintainers.
              The work unit is small, focused, and useful: decide whether a candidate fix is real,
              credible, and worth advancing.
            </p>
          </div>
          <div className="home-steps">
            {steps.map(step => (
              <article key={step.n} className="home-step-card">
                <div className="home-step-top">
                  <div className={`home-icon-box home-icon-box--${step.iconColor}`}>{step.icon}</div>
                  <span className="home-step-num">{step.n}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Our ethos ── */}
      <section className="home-beliefs" id="ethos">
        <div className="wrap">
          <div className="home-section-head">
            <div>
              <div className="home-eyebrow home-eyebrow--light">Our ethos</div>
              <h2>Vendor-neutral, community-led.</h2>
            </div>
            <p className="home-section-intro home-section-intro--light">
              OASIS belongs in the AppSec community. It treats fix automation as an enabler, not the authority.
              Credibility comes from transparent human validation and respect for open source maintainers.
            </p>
          </div>
          <div className="home-belief-grid">
            {beliefs.map(b => (
              <div key={b.title} className="home-belief">
                <b>{b.title}</b>
                <p>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why join ── */}
      <section className="home-section" id="join">
        <div className="wrap">
          <div className="home-section-head">
            <div>
              <div className="home-eyebrow">Why join</div>
              <h2>Help turn AppSec expertise into upstream security.</h2>
            </div>
            <p className="home-section-intro">
              OASIS gives security practitioners a practical way to help secure the software their
              organizations, communities, and economies depend on.
            </p>
          </div>
          <div className="home-reasons">
            {reasons.map(r => (
              <article key={r.title} className="home-reason-card">
                <div className={`home-icon-box${r.green ? ' home-icon-box--green' : ' home-icon-box--blue'}`}>{r.icon}</div>
                <h3>{r.title}</h3>
                <p>{r.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="home-final-cta">
        <div className="wrap">
          <div className="home-final-box">
            <div>
              <h2>Take 5 minutes. Help secure the software that runs the world.</h2>
              <p>OASIS is ready for contributors now.</p>
            </div>
            <a className="btn btn-secondary" href="#register-form">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="btn-icon"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>
              Join Team OASIS
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
