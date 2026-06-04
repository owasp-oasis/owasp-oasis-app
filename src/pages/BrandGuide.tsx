import { useEffect, useRef, useState } from 'react'
import './BrandGuide.css'

const NAV_ITEMS = [
  { id: 'overview',     label: 'Overview' },
  { id: 'name',         label: 'Name & Usage' },
  { id: 'terminology',  label: 'Terminology' },
  { id: 'voice',        label: 'Voice & Tone' },
  { id: 'messages',     label: 'Key Messages' },
  { id: 'principles',   label: 'Principles' },
  { id: 'colors',       label: 'Color Palette' },
  { id: 'typography',   label: 'Typography' },
  { id: 'logo',         label: 'Logo & Lockup' },
  { id: 'ui-patterns',  label: 'UI Patterns' },
  { id: 'writing',      label: 'Writing Style' },
]

const PRIMARY_COLORS = [
  { name: 'Navy',        hex: '#0b4f8a', token: '--blue-dark',    role: 'Primary brand color; logo outer shield, dark backgrounds' },
  { name: 'Blue',        hex: '#0f6fcf', token: '--blue',         role: 'Interactive elements, links, borders' },
  { name: 'Mid Blue',    hex: '#1558d6', token: '--blue-mid',     role: 'Button hover states' },
  { name: 'Blue Soft',   hex: '#e7f1ff', token: '--blue-soft',    role: 'Backgrounds, badge fills, highlights' },
  { name: 'Green',       hex: '#0d9e52', token: '--green',        role: 'Success states, "Do" callouts' },
  { name: 'Green Bright',hex: '#4cd964', token: '--green-bright', role: 'Circuit nodes in logo; primary button background' },
  { name: 'Green Soft',  hex: '#e8f9ef', token: '--green-soft',   role: 'Success backgrounds, green badge fill' },
  { name: 'Paper',       hex: '#f7fbff', token: '--paper',        role: 'Page backgrounds, alternate section fill' },
]

const GRAY_COLORS = [
  { name: 'Ink',         hex: '#07111f', token: '--ink',          role: 'Primary text, highest-contrast elements' },
  { name: 'Ink Soft',    hex: '#243247', token: '--ink-soft',     role: 'Body text, secondary headings' },
  { name: 'Muted',       hex: '#61738b', token: '--muted',        role: 'Captions, metadata, placeholders' },
  { name: 'Gray 800',    hex: '#1e2d3d', token: '--gray-800',     role: 'Dark surfaces' },
  { name: 'Gray 600',    hex: '#4a5c70', token: '--gray-600',     role: 'Subtle text on light backgrounds' },
  { name: 'Gray 400',    hex: '#9aacbe', token: '--gray-400',     role: 'Disabled states, dividers' },
  { name: 'Gray 200',    hex: '#e8edf5', token: '--gray-200',     role: 'Border lines, dividers' },
  { name: 'Gray 100',    hex: '#f4f7fb', token: '--gray-100',     role: 'Table headers, subtle backgrounds' },
]

function ColorSwatch({ name, hex, token, role }: { name: string; hex: string; token: string; role: string }) {
  return (
    <div className="bg-swatch">
      <div className="bg-swatch-color" style={{ background: hex }} />
      <div className="bg-swatch-meta">
        <p className="bg-swatch-name">{name}</p>
        <p className="bg-swatch-hex">{hex}</p>
        <p className="bg-swatch-token">{token}</p>
        <p className="bg-swatch-role">{role}</p>
      </div>
    </div>
  )
}

export default function BrandGuide() {
  const [activeId, setActiveId] = useState('overview')
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const sections = NAV_ITEMS.map(({ id }) => document.getElementById(id)).filter(Boolean) as HTMLElement[]

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )

    sections.forEach((el) => observerRef.current!.observe(el))
    return () => observerRef.current?.disconnect()
  }, [])

  const scrollTo = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveId(id)
  }

  return (
    <>
      <div className="page-hero">
        <div className="container">
          <p className="page-hero-longform">Open Automated Security Initiative for Software</p>
          <h1>Brand Guide</h1>
          <p>Principles, voice, visual identity, and usage rules for OASIS.</p>
        </div>
      </div>

      <div className="container">
        <div className="bg-layout">

          {/* ── Sidebar ── */}
          <aside className="bg-sidebar">
            <p className="bg-sidebar-title">Contents</p>
            <nav aria-label="Brand guide sections">
              {NAV_ITEMS.map(({ id, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={activeId === id ? 'bg-active' : ''}
                  onClick={scrollTo(id)}
                >
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          {/* ── Content ── */}
          <div className="bg-content">

            {/* 1. Overview */}
            <section id="overview" className="bg-section">
              <p className="bg-section-label">01 — Overview</p>
              <h2>What OASIS is</h2>
              <p>
                OASIS (Open Automated Security Initiative for Software) is an open source project that automates the discovery,
                validation, and upstream submission of security fixes across the open source ecosystem. We combine AI-assisted
                fix automation with a credibility-weighted community of validators to put verified patches directly in front of
                the maintainers who need them.
              </p>
              <p>
                OASIS has submitted a project proposal to OWASP and is currently seeking formal approval. Until that approval
                is granted, the OWASP name and logo must not appear in OASIS brand materials.
              </p>
              <h3>Three brand qualities</h3>
              <div className="bg-do-dont" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="bg-do">
                  <p className="bg-do-label">Urgency</p>
                  <ul>
                    <li>Open source is under active threat</li>
                    <li>Every unfixed CVE is a live exposure</li>
                    <li>Speed of fix matters</li>
                  </ul>
                </div>
                <div className="bg-do">
                  <p className="bg-do-label">Credibility</p>
                  <ul>
                    <li>Validation over automation alone</li>
                    <li>Community trust is earned, not claimed</li>
                    <li>Transparent scoring</li>
                  </ul>
                </div>
                <div className="bg-do">
                  <p className="bg-do-label">Community</p>
                  <ul>
                    <li>Team OASIS does this together</li>
                    <li>Validators are credited</li>
                    <li>Maintainers are partners, not targets</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 2. Name & Usage */}
            <section id="name" className="bg-section">
              <p className="bg-section-label">02 — Name & Usage</p>
              <h2>Name & usage</h2>
              <p>
                The project name is <strong>OASIS</strong> — always written in all-caps. It is an acronym
                (Open Automated Security Initiative for Software) and must never be rendered as "Oasis" or "oasis".
              </p>
              <div className="bg-do-dont">
                <div className="bg-do">
                  <p className="bg-do-label">Correct</p>
                  <ul>
                    <li>OASIS</li>
                    <li>the OASIS project</li>
                    <li>Team OASIS</li>
                    <li>Open Automated Security Initiative for Software</li>
                  </ul>
                </div>
                <div className="bg-dont">
                  <p className="bg-dont-label">Never write</p>
                  <ul>
                    <li>Oasis</li>
                    <li>oasis</li>
                    <li>OWASP OASIS <em>(until formally approved)</em></li>
                    <li>the OASIS tool / platform</li>
                  </ul>
                </div>
              </div>
              <h3>Long-form usage</h3>
              <p>
                Spell out "Open Automated Security Initiative for Software" on first mention in formal documents,
                press materials, and any context where the audience may not know the acronym. Subsequent references
                may use OASIS alone.
              </p>
              <h3>OWASP relationship</h3>
              <p>
                When the OWASP relationship must be mentioned, use this exact phrasing:<br />
                <em>"OASIS has submitted a project proposal to OWASP and is currently seeking formal approval."</em>
              </p>
              <p>
                Do not use the OWASP name or logo in logos, favicons, social assets, or UI elements
                until the proposal is formally accepted.
              </p>
            </section>

            {/* 3. Terminology */}
            <section id="terminology" className="bg-section">
              <p className="bg-section-label">03 — Terminology</p>
              <h2>Canonical terminology</h2>
              <p>Use these terms consistently across all OASIS communications. Avoid informal synonyms that dilute precision.</p>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr>
                      <th>Canonical term</th>
                      <th>Definition</th>
                      <th>Avoid</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Candidate fix</strong></td>
                      <td>An AI-generated patch proposed for a known vulnerability, awaiting validator review</td>
                      <td>patch, suggestion, PR</td>
                    </tr>
                    <tr>
                      <td><strong>Validator</strong></td>
                      <td>A community member who reviews and scores candidate fixes</td>
                      <td>reviewer, judge, tester</td>
                    </tr>
                    <tr>
                      <td><strong>Fix automation</strong></td>
                      <td>The AI-assisted process that generates candidate fixes from CVE data</td>
                      <td>AI, bot, auto-patcher</td>
                    </tr>
                    <tr>
                      <td><strong>Project owner</strong></td>
                      <td>The validator who has taken responsibility for shepherding a candidate fix to upstream acceptance</td>
                      <td>lead, owner, champion</td>
                    </tr>
                    <tr>
                      <td><strong>Maintainer</strong></td>
                      <td>The upstream open source project maintainer who receives and reviews submitted fixes</td>
                      <td>upstream developer, author</td>
                    </tr>
                    <tr>
                      <td><strong>Upstream submission</strong></td>
                      <td>The act of opening a pull request or patch in the affected open source project</td>
                      <td>sending, pushing, filing</td>
                    </tr>
                    <tr>
                      <td><strong>Upstream acceptance</strong></td>
                      <td>The maintainer merging or applying the submitted fix</td>
                      <td>merge, approval, sign-off</td>
                    </tr>
                    <tr>
                      <td><strong>Validation</strong></td>
                      <td>The community review process that scores a candidate fix for correctness, completeness, and safety</td>
                      <td>testing, QA, vetting</td>
                    </tr>
                    <tr>
                      <td><strong>Credibility-weighted</strong></td>
                      <td>Scoring or ranking that gives higher weight to validators with proven track records</td>
                      <td>reputation-based, trusted</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4. Voice & Tone */}
            <section id="voice" className="bg-section">
              <p className="bg-section-label">04 — Voice & Tone</p>
              <h2>Voice & tone</h2>
              <p>
                OASIS communicates with five voice qualities. These are stable regardless of channel;
                tone shifts contextually within them.
              </p>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr><th>Quality</th><th>What it means in practice</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Direct</strong></td>
                      <td>Say exactly what you mean. No hedging, no filler. Lead with the verb.</td>
                    </tr>
                    <tr>
                      <td><strong>Urgent</strong></td>
                      <td>The problem is real and live. Every unfixed CVE matters. Write accordingly.</td>
                    </tr>
                    <tr>
                      <td><strong>Technically credible</strong></td>
                      <td>Use precise terms. Don't simplify at the cost of accuracy.</td>
                    </tr>
                    <tr>
                      <td><strong>Community-first</strong></td>
                      <td>Validators and maintainers are partners. We do this together.</td>
                    </tr>
                    <tr>
                      <td><strong>Unpretentious</strong></td>
                      <td>No hype. No superlatives. Let the work speak.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3>Tone by context</h3>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr><th>Context</th><th>Tone adjustment</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Homepage hero</td><td>Bold and declarative — "The open source ecosystem has a security debt."</td></tr>
                    <tr><td>Validator onboarding</td><td>Welcoming, practical, step-by-step — remove friction</td></tr>
                    <tr><td>Leaderboard copy</td><td>Celebratory but earned — acknowledge real contribution</td></tr>
                    <tr><td>Press / external</td><td>Factual and precise — cite data, avoid adjectives</td></tr>
                    <tr><td>Error states / UI</td><td>Clear, calm, actionable — never blame the user</td></tr>
                  </tbody>
                </table>
              </div>
              <h3>Do and don't</h3>
              <div className="bg-do-dont">
                <div className="bg-do">
                  <p className="bg-do-label">Write like this</p>
                  <ul>
                    <li>OASIS automates fix generation and routes validated patches to maintainers.</li>
                    <li>Every validator score carries weight.</li>
                    <li>Unfixed vulnerabilities ship. We help stop that.</li>
                  </ul>
                </div>
                <div className="bg-dont">
                  <p className="bg-dont-label">Avoid</p>
                  <ul>
                    <li>OASIS is a revolutionary AI-powered platform that transforms security.</li>
                    <li>We leverage synergistic community intelligence.</li>
                    <li>Our cutting-edge solution solves all your AppSec challenges.</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 5. Key Messages */}
            <section id="messages" className="bg-section">
              <p className="bg-section-label">05 — Key Messages</p>
              <h2>Key messages</h2>
              <p>These are the approved, exact phrasings for each message type. Use them verbatim in formal contexts.</p>
              <div className="bg-msg-grid">
                <div className="bg-msg-card highlight">
                  <p className="bg-msg-label">Primary tagline</p>
                  <p className="bg-msg-text">Fix open source. Together.</p>
                </div>
                <div className="bg-msg-card">
                  <p className="bg-msg-label">Mission statement</p>
                  <p className="bg-msg-text">
                    OASIS automates the discovery, validation, and upstream submission of security fixes
                    across the open source ecosystem — turning known vulnerabilities into merged patches.
                  </p>
                </div>
                <div className="bg-msg-card">
                  <p className="bg-msg-label">Short descriptor (≤ 20 words)</p>
                  <p className="bg-msg-text">
                    Open source security fix automation, powered by a credibility-weighted community of validators.
                  </p>
                </div>
                <div className="bg-msg-card">
                  <p className="bg-msg-label">Footer descriptor</p>
                  <p className="bg-msg-text">
                    Open source powers the world. Vibe hacking exploits it. Team OASIS fixes it.
                  </p>
                </div>
                <div className="bg-msg-card">
                  <p className="bg-msg-label">Call to action</p>
                  <p className="bg-msg-text">Join Team OASIS. Validate a fix today.</p>
                </div>
                <div className="bg-msg-card">
                  <p className="bg-msg-label">Problem statement</p>
                  <p className="bg-msg-text">
                    Open source vulnerabilities are discovered faster than they're fixed. Maintainers are
                    overwhelmed. Known CVEs sit unpatched — sometimes for years.
                  </p>
                </div>
                <div className="bg-msg-card">
                  <p className="bg-msg-label">Solution statement</p>
                  <p className="bg-msg-text">
                    OASIS generates candidate fixes, routes them to a community of validators, and submits
                    approved patches directly to upstream maintainers.
                  </p>
                </div>
              </div>
            </section>

            {/* 6. Principles */}
            <section id="principles" className="bg-section">
              <p className="bg-section-label">06 — Guiding Principles</p>
              <h2>Guiding principles</h2>
              <p>Three principles shape every product and communications decision.</p>
              <div className="bg-principle-grid">
                <div className="bg-principle-card">
                  <div className="bg-principle-icon">⚡</div>
                  <h3>Impact</h3>
                  <p>Real fixes, merged upstream, in real projects used by real people.</p>
                  <ul>
                    <li>We will: measure success by upstream acceptances</li>
                    <li>We will: prioritize high-severity, widely used packages</li>
                    <li>We won't: count activity metrics as impact</li>
                    <li>We won't: ship a fix that has not been validated</li>
                  </ul>
                </div>
                <div className="bg-principle-card">
                  <div className="bg-principle-icon">🔍</div>
                  <h3>Credibility</h3>
                  <p>Trust is built by transparency and verified track records, not claims.</p>
                  <ul>
                    <li>We will: weight validator scores by proven history</li>
                    <li>We will: publish our scoring methodology openly</li>
                    <li>We won't: accept AI output without human validation</li>
                    <li>We won't: make security claims we can't back with data</li>
                  </ul>
                </div>
                <div className="bg-principle-card">
                  <div className="bg-principle-icon">🌐</div>
                  <h3>Village</h3>
                  <p>It takes a community. Credit the people who do the work.</p>
                  <ul>
                    <li>We will: credit every validator publicly</li>
                    <li>We will: treat maintainers as collaborators</li>
                    <li>We won't: automate away human judgment</li>
                    <li>We won't: rush submissions to inflate numbers</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 7. Color Palette */}
            <section id="colors" className="bg-section">
              <p className="bg-section-label">07 — Color Palette</p>
              <h2>Color palette</h2>
              <p>
                OASIS uses a navy-anchored palette with a green circuit accent. All values are defined as
                CSS custom properties in <code>src/index.css</code>.
              </p>
              <h3>Primary colors</h3>
              <div className="bg-swatch-grid">
                {PRIMARY_COLORS.map((c) => <ColorSwatch key={c.token} {...c} />)}
              </div>
              <h3>Neutrals & grays</h3>
              <div className="bg-swatch-grid">
                {GRAY_COLORS.map((c) => <ColorSwatch key={c.token} {...c} />)}
              </div>
              <h3>Borders & shadows</h3>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr><th>Token</th><th>Value</th><th>Usage</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>--line</code></td>
                      <td>rgba(15,111,207,.16)</td>
                      <td>Default card and table borders</td>
                    </tr>
                    <tr>
                      <td><code>--line-strong</code></td>
                      <td>rgba(15,111,207,.28)</td>
                      <td>Emphasized borders, active states</td>
                    </tr>
                    <tr>
                      <td><code>--shadow</code></td>
                      <td>0 18px 50px rgba(11,79,138,.14)</td>
                      <td>Cards, dropdowns, modals</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 8. Typography */}
            <section id="typography" className="bg-section">
              <p className="bg-section-label">08 — Typography</p>
              <h2>Typography</h2>
              <p>Three typefaces, each with a distinct role. Never mix them outside their defined contexts.</p>
              <div className="bg-type-specimens">
                <div className="bg-type-card">
                  <div className="bg-type-preview">
                    <p className="bg-type-serif-sample">Open source powers the world.</p>
                  </div>
                  <div className="bg-type-meta">
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Typeface</span><span className="bg-type-meta-value">DM Serif Display</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Token</span><span className="bg-type-meta-value">--serif</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Weight</span><span className="bg-type-meta-value">400 (Regular)</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Usage</span><span className="bg-type-meta-value">Hero & section headings only</span></div>
                  </div>
                </div>
                <div className="bg-type-card">
                  <div className="bg-type-preview">
                    <p className="bg-type-sans-sample">
                      OASIS automates the discovery, validation, and upstream submission of security fixes
                      across the open source ecosystem — turning known vulnerabilities into merged patches.
                    </p>
                  </div>
                  <div className="bg-type-meta">
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Typeface</span><span className="bg-type-meta-value">Geist</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Token</span><span className="bg-type-meta-value">--sans</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Weights</span><span className="bg-type-meta-value">400, 500, 600, 700</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Usage</span><span className="bg-type-meta-value">All body, UI, and navigation text</span></div>
                  </div>
                </div>
                <div className="bg-type-card">
                  <div className="bg-type-preview">
                    <p className="bg-type-mono-sample">
                      CANDIDATE FIX — CVE-2024-1337 — AWAITING VALIDATION<br />
                      validator · credibility-weighted · upstream submission
                    </p>
                  </div>
                  <div className="bg-type-meta">
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Typeface</span><span className="bg-type-meta-value">Geist Mono</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Token</span><span className="bg-type-meta-value">--mono</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Weights</span><span className="bg-type-meta-value">400, 600, 700</span></div>
                    <div className="bg-type-meta-item"><span className="bg-type-meta-label">Usage</span><span className="bg-type-meta-value">Eyebrows, badges, labels, code, metadata</span></div>
                  </div>
                </div>
              </div>
              <h3>Type scale</h3>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr><th>Role</th><th>Font</th><th>Size</th><th>Weight</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Hero heading</td><td>DM Serif Display</td><td>3–4rem</td><td>400</td></tr>
                    <tr><td>Section heading (h2)</td><td>DM Serif Display</td><td>2–2.5rem</td><td>400</td></tr>
                    <tr><td>Sub-heading (h3)</td><td>Geist</td><td>1.15–1.25rem</td><td>700</td></tr>
                    <tr><td>Body text</td><td>Geist</td><td>1rem</td><td>400</td></tr>
                    <tr><td>Small / caption</td><td>Geist</td><td>0.8–0.875rem</td><td>400–500</td></tr>
                    <tr><td>Eyebrow / badge</td><td>Geist Mono</td><td>0.65–0.78rem</td><td>600–700</td></tr>
                    <tr><td>Code</td><td>Geist Mono</td><td>0.875rem</td><td>400</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 9. Logo & Lockup */}
            <section id="logo" className="bg-section">
              <p className="bg-section-label">09 — Logo & Lockup</p>
              <h2>Logo & lockup</h2>
              <p>
                The OASIS logo is a layered shield: a navy outer shell, a blue inner shield, a white donut ring
                that forms the letter O, and three green circuit nodes radiating from the top and upper flanks.
                The green nodes carry the signature "circuit" energy of the brand.
              </p>
              <h3>Three variants</h3>
              <div className="bg-logo-grid">
                <div className="bg-logo-card">
                  <div className="bg-logo-preview bg-paper">
                    <img src="/logo/oasis-logo.svg" alt="OASIS icon" style={{ height: 72 }} />
                  </div>
                  <div className="bg-logo-caption">
                    <p className="bg-logo-caption-name">Icon</p>
                    <p className="bg-logo-caption-desc">Shield only. Use at small sizes, favicons, app icons. Min 24px.</p>
                  </div>
                </div>
                <div className="bg-logo-card">
                  <div className="bg-logo-preview bg-paper">
                    <img src="/logo/oasis-wordmark.svg" alt="OASIS wordmark" style={{ maxWidth: 160 }} />
                  </div>
                  <div className="bg-logo-caption">
                    <p className="bg-logo-caption-name">Wordmark</p>
                    <p className="bg-logo-caption-desc">Shield-as-O + ASIS. Default for headers and nav. Min 120px wide.</p>
                  </div>
                </div>
                <div className="bg-logo-card">
                  <div className="bg-logo-preview bg-paper">
                    <img src="/logo/oasis-wordmark-full.svg" alt="OASIS full wordmark" style={{ maxWidth: 180 }} />
                  </div>
                  <div className="bg-logo-caption">
                    <p className="bg-logo-caption-name">Full lockup</p>
                    <p className="bg-logo-caption-desc">Wordmark + full name. Use in formal docs, presentations. Min 200px wide.</p>
                  </div>
                </div>
              </div>
              <h3>Approved backgrounds</h3>
              <div className="bg-logo-grid">
                <div className="bg-logo-card">
                  <div className="bg-logo-preview bg-white">
                    <img src="/logo/oasis-wordmark.svg" alt="OASIS on white" style={{ maxWidth: 140 }} />
                  </div>
                  <div className="bg-logo-caption">
                    <p className="bg-logo-caption-name">White (#ffffff)</p>
                    <p className="bg-logo-caption-desc">Preferred for light interfaces and print</p>
                  </div>
                </div>
                <div className="bg-logo-card">
                  <div className="bg-logo-preview bg-paper">
                    <img src="/logo/oasis-wordmark.svg" alt="OASIS on paper" style={{ maxWidth: 140 }} />
                  </div>
                  <div className="bg-logo-caption">
                    <p className="bg-logo-caption-name">Paper (#f7fbff)</p>
                    <p className="bg-logo-caption-desc">Approved; used across the OASIS site</p>
                  </div>
                </div>
                <div className="bg-logo-card">
                  <div className="bg-logo-preview bg-navy">
                    <img src="/logo/oasis-wordmark.svg" alt="OASIS on navy" style={{ maxWidth: 140 }} />
                  </div>
                  <div className="bg-logo-caption">
                    <p className="bg-logo-caption-name">Navy (#0b4f8a)</p>
                    <p className="bg-logo-caption-desc">Approved for dark headers and hero sections</p>
                  </div>
                </div>
              </div>
              <h3>Clear space & minimum sizes</h3>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr><th>Variant</th><th>Minimum size</th><th>Clear space</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Icon only</td><td>24px height</td><td>1× shield height on all sides</td></tr>
                    <tr><td>Wordmark</td><td>120px width</td><td>1× shield height on all sides</td></tr>
                    <tr><td>Full lockup</td><td>200px width</td><td>1× shield height on all sides</td></tr>
                  </tbody>
                </table>
              </div>
              <h3>Logo misuse — never do this</h3>
              <div className="bg-do-dont">
                <div className="bg-dont" style={{ gridColumn: '1 / -1' }}>
                  <p className="bg-dont-label">Logo misuse</p>
                  <ul>
                    <li>Do not recolor the shield, ring, or circuit nodes</li>
                    <li>Do not place the logo on low-contrast or photographic backgrounds</li>
                    <li>Do not rotate or skew the logo</li>
                    <li>Do not add drop shadows or effects to the SVG</li>
                    <li>Do not use a raster (PNG) version where an SVG is available</li>
                    <li>Do not combine the OASIS logo with the OWASP logo until formal approval is granted</li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 10. UI Patterns */}
            <section id="ui-patterns" className="bg-section">
              <p className="bg-section-label">10 — UI Patterns</p>
              <h2>UI patterns</h2>
              <p>
                All interactive elements follow the design token system. Do not introduce raw hex values
                or one-off styles — reference CSS custom properties exclusively.
              </p>
              <h3>Buttons</h3>
              <div className="bg-specimen-row">
                <button className="btn btn-primary">Join Team OASIS</button>
                <button className="btn btn-secondary">View leaderboards</button>
                <button className="btn btn-outline">Learn more</button>
              </div>
              <div className="bg-table-wrap" style={{ marginTop: 12 }}>
                <table className="bg-table">
                  <thead>
                    <tr><th>Variant</th><th>Background</th><th>Text</th><th>Usage</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>.btn-primary</code></td>
                      <td>--green-bright (#4cd964)</td>
                      <td>--blue-dark (navy)</td>
                      <td>Primary CTA — one per view</td>
                    </tr>
                    <tr>
                      <td><code>.btn-secondary</code></td>
                      <td>--blue (#0f6fcf)</td>
                      <td>white</td>
                      <td>Secondary actions</td>
                    </tr>
                    <tr>
                      <td><code>.btn-outline</code></td>
                      <td>transparent</td>
                      <td>--blue</td>
                      <td>Tertiary / ghost actions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3>Badges</h3>
              <div className="bg-specimen-row">
                <span className="badge badge-green">Upstream accepted</span>
                <span className="badge badge-blue">In validation</span>
                <span className="badge badge-purple">AI-generated</span>
              </div>
              <div className="bg-table-wrap" style={{ marginTop: 12 }}>
                <table className="bg-table">
                  <thead>
                    <tr><th>Variant</th><th>Background</th><th>Text</th><th>Usage</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>.badge-green</code></td>
                      <td>#e6faea</td>
                      <td>#1a7a2e</td>
                      <td>Success / accepted / merged</td>
                    </tr>
                    <tr>
                      <td><code>.badge-blue</code></td>
                      <td>--blue-soft</td>
                      <td>--blue-dark</td>
                      <td>Status / in-progress</td>
                    </tr>
                    <tr>
                      <td><code>.badge-purple</code></td>
                      <td>#ede9fe</td>
                      <td>#5b21b6</td>
                      <td>AI-generated content label</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <h3>Section layout</h3>
              <p>
                Pages follow a consistent rhythm: <code>.page-hero</code> (gradient, full-bleed) → alternating
                <code>.section</code> blocks (80px vertical padding) → <code>.container</code> (max-width 1080px, auto margins).
                Use <code>.section-sm</code> (48px) for supporting or utility sections.
              </p>
              <h3>Eyebrows</h3>
              <p>
                Use <code>.page-hero-longform</code> or the eyebrow pattern (Geist Mono, ~0.72rem, uppercase,
                letter-spacing 0.1em, color <code>--blue</code> or white at 65% opacity) to label sections
                before the serif heading. Never use a serif font for eyebrows.
              </p>
            </section>

            {/* 11. Writing Style */}
            <section id="writing" className="bg-section">
              <p className="bg-section-label">11 — Writing Style</p>
              <h2>Writing style</h2>
              <h3>Capitalization</h3>
              <div className="bg-table-wrap">
                <table className="bg-table">
                  <thead>
                    <tr><th>Term</th><th>Correct form</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>Project name</td><td>OASIS (always all-caps)</td></tr>
                    <tr><td>Application security</td><td>AppSec</td></tr>
                    <tr><td>Version control platform</td><td>GitHub</td></tr>
                    <tr><td>Foundation name</td><td>OWASP</td></tr>
                    <tr><td>Guiding principles</td><td>Impact, Credibility, Village (capitalized)</td></tr>
                    <tr><td>Community label</td><td>Team OASIS</td></tr>
                    <tr><td>Page and section headings</td><td>Sentence case, not Title Case</td></tr>
                  </tbody>
                </table>
              </div>
              <h3>Grammar & style</h3>
              <div className="bg-do-dont">
                <div className="bg-do">
                  <p className="bg-do-label">Follow these rules</p>
                  <ul>
                    <li>Use sentence case for all headings and subheadings</li>
                    <li>Spell out numbers one through nine; use numerals for 10+</li>
                    <li>Use the Oxford comma: "discovery, validation, and submission"</li>
                    <li>Use em dashes (—) without spaces for parenthetical asides</li>
                    <li>Link text should describe the destination: "view the leaderboards" not "click here"</li>
                    <li>Attribute direct quotes with full name and role on first mention</li>
                  </ul>
                </div>
                <div className="bg-dont">
                  <p className="bg-dont-label">Avoid</p>
                  <ul>
                    <li>Title Case for descriptive headings</li>
                    <li>Exclamation marks in body copy (one per page maximum)</li>
                    <li>Passive voice when active is possible</li>
                    <li>Abbreviations on first use without spelling out</li>
                    <li>"Click here", "learn more" as standalone link text</li>
                    <li>Jargon that trades precision for cleverness</li>
                  </ul>
                </div>
              </div>
              <h3>Press & attribution</h3>
              <p>
                When quoting OASIS in press materials or external publications, use the following attribution line:
              </p>
              <p>
                <em>OASIS (Open Automated Security Initiative for Software) is an open source project automating
                security fix generation, validation, and upstream submission across the open source ecosystem.
                OASIS has submitted a project proposal to OWASP and is currently seeking formal approval.</em>
              </p>
            </section>

          </div>{/* .bg-content */}
        </div>{/* .bg-layout */}
      </div>{/* .container */}
    </>
  )
}
