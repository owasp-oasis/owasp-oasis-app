import './About.css'

const team = [
  {
    name: 'Chris Holt',
    role: 'Project Lead & Technical Architect',
    bio: `Chris has run bug bounty programs and community for one of the world's largest bug bounty platforms, where distributed communities of experts proved they could do offensive security work at scale. That model — crowdsourced expertise applied to a hard problem — is exactly what OASIS brings to the defense side. When fix automation made it possible to generate candidate patches at speed, Chris saw the opportunity to build the community mechanism that would make those fixes credible and trustworthy for open source maintainers.`,
    github: 'humor4fun',
  },
  {
    name: 'Michael Cartsonis',
    role: 'Co-Founder',
    bio: `Michael brought the frustration of watching application security treated as an afterthought across the industry. AppSec professionals are some of the most capable people in technology — and in most organizations, they're denied the agency to act directly on that expertise. They sit outside the teams writing the code. They can see what's broken. They're rarely given the agency to help. OASIS changes that: a real pipeline of candidate fixes the AppSec community can validate and connect to the maintainers who need them.`,
    github: null,
  },
]

const advisor = {
  name: 'David Wichers',
  role: 'Founding Advisor & OWASP Liaison',
  bio: `David Wichers is one of the founders of OWASP and the creator of the OWASP Benchmark — the industry's most widely cited standard for evaluating SAST tool performance. His involvement in OASIS signals something important: the technologies and processes OASIS is building represent a genuine advance for the application security community. David submitted the OASIS project proposal to OWASP, and is already validating PRs himself.`,
  github: null,
}

export default function About() {
  return (
    <div className="about">
      {/* ── Page hero ── */}
      <div className="page-hero">
        <div className="container">
          <h1>About OASIS</h1>
          <p>Where the idea came from, and the people making it happen.</p>
        </div>
      </div>

      {/* ── Origin story ── */}
      <section className="section">
        <div className="container about-story">
          <div className="about-story-header">
            <span className="badge badge-blue">Origin Story</span>
            <h2>A lunch that turned into a movement</h2>
          </div>

          <div className="story-body">
            <p>
              Chris Holt and Michael Cartsonis met at OWASP Global AppSec 2025 — a
              chance lunch that became a two-hour conversation, then continued
              that night with a leading open-source engineer. The thread running
              through all of it: two communities that desperately need each other
              have never had a way to work together at scale.
            </p>
            <p>
              Open-source maintainers are drowning in noise. AI tools are flooding
              repositories with unvetted, low-quality fix proposals — what the
              community has started calling "AI slop PRs." Maintainers don't have
              the bandwidth to evaluate them, so they push back on all AI-generated
              contributions, even the good ones. Real vulnerabilities go unfixed.
            </p>
            <p>
              Meanwhile, tens of thousands of AppSec professionals have exactly the
              expertise needed to validate those fixes — and no mechanism to apply
              it beyond the organizations they work for. They can read AI-generated
              code fixes, assess vulnerabilities, and judge fix quality. They've
              just never had a delivery mechanism.
            </p>
            <p>
              The idea evolved through conversations at RSA and culminated in the
              first live pilot at{' '}
              <strong>Tropicon 2026 in Cozumel</strong> — a hands-on workshop
              where participants reviewed real vulnerabilities, validated fixes, and
              helped identify which submissions were credible enough to send
              upstream. More than 20% of attendees signed up on the spot.
            </p>
            <p>
              Chris and Michael brought the opportunity to{' '}
              <strong>David Wichers</strong> — one of the founders of OWASP and
              creator of the OWASP Benchmark. He agreed to submit the project
              proposal. Formal approval may take months.{' '}
              <strong>OASIS isn't waiting.</strong>
            </p>
            <p>
              The volunteer team is now five people and growing. Several projects
              are already operating. Beta testing is happening now. Signups are
              accelerating through word of mouth. OASIS is becoming exactly what
              that lunch conversation envisioned: an ongoing, community-driven
              movement for securing the open-source software the world runs on.
            </p>
          </div>
        </div>
      </section>

      {/* ── Team ── */}
      <section className="section-sm team-section">
        <div className="container">
          <h2 className="text-center team-heading">The Team</h2>
          <p className="text-center team-sub">
            A small, growing group of volunteers who believe the AppSec community
            can step up and fix the software that runs the world.
          </p>

          <div className="team-grid">
            {team.map(member => (
              <div key={member.name} className="team-card">
                <div className="team-avatar" aria-hidden="true">
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="team-info">
                  <h3>{member.name}</h3>
                  <p className="team-role">{member.role}</p>
                  <p className="team-bio">{member.bio}</p>
                  {member.github && (
                    <a
                      href={`https://github.com/${member.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="team-github"
                    >
                      @{member.github}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Advisor */}
          <div className="advisor-section">
            <h3 className="advisor-label">Founding Advisor</h3>
            <div className="team-card team-card--advisor">
              <div className="team-avatar team-avatar--advisor" aria-hidden="true">
                {advisor.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="team-info">
                <h3>{advisor.name}</h3>
                <p className="team-role">{advisor.role}</p>
                <p className="team-bio">{advisor.bio}</p>
              </div>
            </div>
          </div>

          <div className="team-growing">
            <p>
              + a growing volunteer team of 5 and counting.{' '}
              <a href="/home">Join Team OASIS</a> to be part of what comes next.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
