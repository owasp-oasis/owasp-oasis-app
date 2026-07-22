import './Support.css'

const socialMessages = [
  {
    label: 'General awareness',
    text: `OASIS is using community-driven human validation to fix open source security vulnerabilities at scale — bridging AI fix automation and real maintainer acceptance. AppSec professionals can contribute expertise directly to the software everyone depends on. Learn more at owasp-oasis.org`,
  },
  {
    label: 'Validator recruitment',
    text: `Do you review code for a living? OASIS (OWASP) needs AppSec validators to review AI-generated security fixes for open source software. Eight minutes per review. Your expertise matters. Join at owasp-oasis.org`,
  },
  {
    label: 'Conference / practitioner',
    text: `If you work in AppSec and want your expertise to directly improve open source security — not just talk about it — OASIS gives you a structured, low-commitment way to do exactly that. Human-validated fixes, OWASP-backed, maintainer-friendly. owasp-oasis.org`,
  },
]

export default function Support() {
  return (
    <div className="support">
      <div className="page-hero">
        <div className="container">
          <h1>Support OASIS</h1>
          <p>
            OASIS runs on community effort and shared belief that human-validated security
            fixes belong in open source. Here is how you can help.
          </p>
        </div>
      </div>

      {/* ── 1. Shout About It ── */}
      <section className="section support-shout">
        <div className="container">
          <h2 className="support-section-title">Shout About It</h2>
          <p className="support-section-sub">
            The single most valuable thing most people can do right now is tell the right
            people that OASIS exists. Here are three ready-to-share messages for different
            audiences.
          </p>
          <div className="social-cards">
            {socialMessages.map(msg => (
              <div key={msg.label} className="social-card">
                <div className="social-card-label">{msg.label}</div>
                <blockquote className="social-card-text">{msg.text}</blockquote>
                <button
                  className="social-copy-btn"
                  onClick={() => navigator.clipboard.writeText(msg.text).catch(() => undefined)}
                  title="Copy to clipboard"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Targeted Conversations ── */}
      <section className="section support-conversations">
        <div className="container">
          <h2 className="support-section-title">Targeted Conversations</h2>
          <p className="support-section-sub">
            Word of mouth works best when it is specific. These are the conversations
            most likely to bring in people who will actually stay engaged.
          </p>
          <div className="conversations-grid">
            <div className="conversation-card">
              <div className="conversation-card-icon" aria-hidden="true">&#127760;</div>
              <h3>Security conferences &amp; meetups</h3>
              <p>
                AppSec practitioners at OWASP events, BSides, DEF CON AppSec Village,
                and regional meetups are the ideal validator profile. If you are attending,
                bring it up. If you are speaking, mention it. OASIS benefits from
                practitioner-to-practitioner credibility.
              </p>
            </div>
            <div className="conversation-card">
              <div className="conversation-card-icon" aria-hidden="true">&#128101;</div>
              <h3>Security teams &amp; practitioners</h3>
              <p>
                Do you work with or know security engineers, penetration testers, or
                vulnerability researchers? Those are exactly the people whose expertise
                makes OASIS work. A personal recommendation from a trusted colleague
                converts far better than any post.
              </p>
            </div>
            <div className="conversation-card">
              <div className="conversation-card-icon" aria-hidden="true">&#127970;</div>
              <h3>Open source maintainers</h3>
              <p>
                Maintainers who are already receiving AI-generated PRs understand the
                problem immediately. Help them understand that OASIS exists to bring
                human-vetted contributions &mdash; not more noise. A maintainer&rsquo;s
                endorsement creates trust with the projects we want to help.
              </p>
            </div>
            <div className="conversation-card">
              <div className="conversation-card-icon" aria-hidden="true">&#127979;</div>
              <h3>Academic &amp; research contacts</h3>
              <p>
                Researchers working on vulnerability detection, software supply chain
                security, or AI-assisted development will find OASIS interesting. The
                validation dataset OASIS produces is a novel research artifact. Bring
                it up in those circles.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. Be a Validator ── */}
      <section className="section support-validator">
        <div className="container">
          <h2 className="support-section-title">Be a Validator</h2>
          <p className="support-section-sub">
            The core of OASIS is the validation community. Validators review AI-generated
            security fix proposals and vote: accept, modify, or reject. It takes roughly
            eight minutes per review. No code contribution required &mdash; only the
            ability to read and reason about code.
          </p>
          <div className="validator-steps">
            <div className="validator-step">
              <div className="validator-step-num">1</div>
              <div>
                <h3>Join the project on GitHub</h3>
                <p>
                  All validation work happens in GitHub pull requests on the{' '}
                  <a
                    href="https://github.com/owasp-oasis"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    owasp-oasis GitHub organization
                  </a>
                  . Start by exploring the open PRs and watching the repository.
                </p>
              </div>
            </div>
            <div className="validator-step">
              <div className="validator-step-num">2</div>
              <div>
                <h3>Use the OASIS validation template</h3>
                <p>
                  Every validation comment uses a structured template that captures your
                  decision (accept / modify / reject), your reasoning, and optional
                  severity and fix quality scores. The template is pinned in the project
                  repository.
                </p>
              </div>
            </div>
            <div className="validator-step">
              <div className="validator-step-num">3</div>
              <div>
                <h3>Build your reputation</h3>
                <p>
                  Every validated PR earns you interactions, peer reactions, and a growing
                  reputation score visible on the{' '}
                  <a href="/leaderboards">OASIS Leaderboards</a>. Consistent, high-quality
                  validators gain credibility weight &mdash; your vote carries more over time.
                </p>
              </div>
            </div>
          </div>
          <div className="validator-cta">
            <a
              href="https://github.com/owasp-oasis"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              Start validating on GitHub &rarr;
            </a>
            <a href="/#register-form" className="btn btn-secondary">
              Join Team OASIS
            </a>
          </div>
        </div>
      </section>

      {/* ── 4. Be a Sponsor ── */}
      <section className="section support-sponsor-section">
        <div className="container">
          <h2 className="support-section-title">Be a Sponsor</h2>
          <p className="support-section-sub">
            Sponsorship supports project operations, infrastructure, and community
            growth. It does not influence project governance, fix selection, validation
            outcomes, or community direction.
          </p>
          <div className="sponsor-type-cards">
            <div className="sponsor-type-card sponsor-type-card--personal">
              <div className="sponsor-type-card-header">
                <span className="badge badge-green">Personal</span>
                <h3>Individual support</h3>
              </div>
              <p>
                Individual financial contributions in the $1&ndash;$250 range are coming
                soon via OWASP&rsquo;s donation infrastructure. If you want to support
                OASIS personally, register your interest and we will notify you
                when individual giving is available.
              </p>
              <a href="/sponsors#sponsor-interest" className="btn btn-secondary">
                Register interest &rarr;
              </a>
            </div>
            <div className="sponsor-type-card sponsor-type-card--corporate">
              <div className="sponsor-type-card-header">
                <span className="badge badge-blue">Corporate</span>
                <h3>Organizational support</h3>
              </div>
              <p>
                Corporate sponsorship is available now. To discuss your organization&rsquo;s
                participation, email{' '}
                <a href="mailto:chris.holt@owasp.org">chris.holt@owasp.org</a> with your
                company name and planned contribution amount. We will follow up with a
                sponsorship agreement and next steps.
              </p>
              <a href="mailto:chris.holt@owasp.org" className="btn btn-primary">
                Email chris.holt@owasp.org &rarr;
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
