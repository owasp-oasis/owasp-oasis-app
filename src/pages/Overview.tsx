import { useState } from 'react'
import './Overview.css'

const steps = [
  {
    n: '1',
    title: 'Scan & Generate',
    body: `OASIS project leaders use fix automation tools — static analysis, SAST, dependency analysis, and LLM-assisted fix generation — to scan important open-source repositories and generate candidate security fixes. Multiple tools may contribute fixes to the same vulnerability, providing a community benchmarking mechanism to compare tool efficacy.`,
    tag: 'Impact',
    color: 'green',
  },
  {
    n: '2',
    title: 'Community Validation',
    body: `OASIS community members review candidate fixes through a structured, GitHub-centered workflow. Validators don't need to write code — only interpret it. They assess two questions: Is this a real vulnerability? Is this a good fix? A credibility-weighted system means senior expertise carries more weight than volume alone. Think Duolingo — a focused, low-commitment habit rather than a second job.`,
    tag: 'Credibility',
    color: 'blue',
  },
  {
    n: '3',
    title: 'Tag & Score',
    body: `Validators annotate fixes using a structured tag system: whether the fix correctly addresses the vulnerability, whether it introduces unnecessary dependencies, whether a better approach exists. This creates a clean feedback loop back to the tools that generated the fixes. Contributing vendors get the feedback that improves their product performance.`,
    tag: 'Village',
    color: 'purple',
  },
  {
    n: '4',
    title: 'Upstream Submission',
    body: `Fixes that reach the validation threshold are passively offered to open-source projects — carrying the OASIS community's endorsement. Maintainers receive a community-vetted, credible contribution rather than raw AI output. They keep full control of what merges. Contributors get professional validation, reputation, and the satisfaction of securing software the world depends on.`,
    tag: 'Impact',
    color: 'green',
  },
]

const principles = [
  {
    label: 'Impact',
    color: 'green' as const,
    statement: 'Focus on impact.',
    summary: 'Work on repositories where acceptance is plausible. Focus on practical outcomes, not raw PR volume.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="20" cy="20" r="18" stroke="#4CD964" strokeWidth="2" fill="#e6faea"/>
        <circle cx="20" cy="20" r="11" stroke="#4CD964" strokeWidth="2" fill="none"/>
        <circle cx="20" cy="20" r="4" fill="#4CD964"/>
        <line x1="20" y1="2" x2="20" y2="8" stroke="#4CD964" strokeWidth="2" strokeLinecap="round"/>
        <line x1="20" y1="32" x2="20" y2="38" stroke="#4CD964" strokeWidth="2" strokeLinecap="round"/>
        <line x1="2" y1="20" x2="8" y2="20" stroke="#4CD964" strokeWidth="2" strokeLinecap="round"/>
        <line x1="32" y1="20" x2="38" y2="20" stroke="#4CD964" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    will: [
      'Work on repositories where upstream acceptance is plausible',
      'Minimize implementation effort',
      'Measure success by upstream acceptance rate, not activity metrics',
    ],
    willNot: [
      'Aim for raw PR volume',
      'Wait for opt-in from upstream projects before beginning',
    ],
  },
  {
    label: 'Credibility',
    color: 'blue' as const,
    statement: 'Acceptance builds credibility.',
    summary: 'Treat automation as a source of candidate fixes, not a source of truth. Human review is what makes a fix trustworthy.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="8" y="4" width="24" height="30" rx="3" stroke="#0F6FCF" strokeWidth="2" fill="#e8f0fb"/>
        <path d="M14 13h12M14 19h12M14 25h8" stroke="#0F6FCF" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="29" cy="30" r="7" fill="#0F6FCF"/>
        <path d="M26 30l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    will: [
      'Treat automation as a source of candidate fixes, not a source of truth',
      'Require human validation before any upstream submission',
      'Use weighted reviewer credibility rather than a fixed approval count',
      'Clearly communicate OWASP community review in every upstream PR',
    ],
    willNot: [
      'Submit AI-generated fixes directly to upstream projects without human review',
      'Claim OASIS bypasses maintainers — maintainers still decide what merges',
    ],
  },
  {
    label: 'Village',
    color: 'purple' as const,
    statement: 'It takes a village.',
    summary: 'Keep the authoritative review and decision process under the OWASP project. This work belongs to the community.',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="20" cy="13" r="5" stroke="#7C3AED" strokeWidth="2" fill="#ede9fe"/>
        <circle cx="8" cy="28" r="4" stroke="#7C3AED" strokeWidth="2" fill="#ede9fe"/>
        <circle cx="32" cy="28" r="4" stroke="#7C3AED" strokeWidth="2" fill="#ede9fe"/>
        <path d="M15 18c-3 1-6 4-6 7M25 18c3 1 6 4 6 7M14 26c2-3 10-3 12 0" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    will: [
      'Keep the authoritative review and decision process under the OWASP project',
      'Operate transparently — the GitHub-based workflow is auditable by anyone',
      'Build trusted relationships between validators, project owners, and maintainers',
      'Welcome validators at all experience levels — new practitioners learn alongside veterans',
    ],
    willNot: [
      'Allow any single vendor to control governance, fix selection, or validation outcomes',
      'Publicly expose unresolved vulnerabilities by default',
    ],
  },
]

export default function Overview() {
  const [openPrinciple, setOpenPrinciple] = useState<string | null>(null)

  function togglePrinciple(label: string) {
    setOpenPrinciple(prev => prev === label ? null : label)
  }

  return (
    <div className="overview">
      <div className="page-hero">
        <div className="container">
          <h1>How OASIS Works</h1>
          <p>
            A practical, community-driven operating model that turns automated
            findings into human-validated upstream security improvements.
          </p>
        </div>
      </div>

      {/* Guiding Principles */}
      <section className="section overview-principles">
        <div className="container">
          <div className="principles-header">
            <h2>Guiding Principles</h2>
            <p>
              Three principles govern everything OASIS does — how we select repositories,
              how we validate fixes, and how we work together as a community.
            </p>
          </div>

          {/* 3 clickable summary cards */}
          <div className="principle-cards-row">
            {principles.map(p => {
              const isOpen = openPrinciple === p.label
              return (
                <button
                  key={p.label}
                  className={`principle-summary-card principle-summary-card--${p.color}${isOpen ? ' principle-summary-card--open' : ''}`}
                  onClick={() => togglePrinciple(p.label)}
                  aria-expanded={isOpen}
                >
                  <div className="principle-card-icon">{p.icon}</div>
                  <span className={`principle-tag principle-tag--${p.color}`}>{p.label}</span>
                  <p className="principle-statement">{p.statement}</p>
                  <p>{p.summary}</p>
                  <span className="principle-card-more">
                    {isOpen ? '▲ See less' : '▼ See more'}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Detail panels — only one open at a time */}
          {principles.map(p => (
            openPrinciple === p.label && (
              <div key={p.label} className={`principle-detail principle-detail--${p.color}`}>
                <div className="principle-columns">
                  <div className="principle-col">
                    <h4>This project will&hellip;</h4>
                    <ul>
                      {p.will.map(item => (
                        <li key={item}>
                          <span className="principle-check" aria-hidden="true">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="principle-col principle-col--not">
                    <h4>This project will not&hellip;</h4>
                    <ul>
                      {p.willNot.map(item => (
                        <li key={item}>
                          <span className="principle-cross" aria-hidden="true">✕</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      </section>

      {/* Problem / Solution */}
      <section className="section">
        <div className="container overview-problem">
          <div className="overview-col">
            <span className="badge badge-blue">The Problem</span>
            <h2>Two communities that need each other — with no way to connect</h2>
            <p>
              Open-source maintainers are drowning in noise. AI tools are flooding
              repositories with unvetted fix proposals — "AI slop PRs." Maintainers
              push back on all AI-generated contributions, even good ones. Real
              vulnerabilities go unfixed.
            </p>
            <p>
              Meanwhile, tens of thousands of AppSec professionals have exactly the
              expertise needed to validate those fixes, and no mechanism to deliver
              it. They can assess vulnerabilities and judge fix quality. They've
              just never had a delivery mechanism.
            </p>
          </div>
          <div className="overview-col">
            <span className="badge badge-green">The Solution</span>
            <h2>OASIS is the community validation layer</h2>
            <p>
              New Fix Automation tooling, recently made possible by generative AI,
              can generate candidate fixes very quickly. OASIS brings in a community
              of human validators to review, validate, improve, and help advance
              credible fixes upstream.
            </p>
            <p>
              AI creates the urgency. Fix Automation creates the opportunity.
              Human expertise makes the work credible. Team OASIS marshals the
              community to deliver human-validated fixes at scale.
            </p>
          </div>
        </div>
      </section>

      {/* How it works — brief summary cards */}
      <section className="section how-it-works">
        <div className="container">
          <h2 className="text-center how-title">How it works</h2>
          <p className="text-center how-sub">
            A focused, low-commitment habit — not a second job.
            A single validation takes roughly eight minutes.
          </p>
          <div className="steps">
            {[
              { n: '1', color: 'green',  title: 'Scan & Generate',    body: 'OASIS project leaders use fix automation tools to scan important open-source repositories and generate candidate security fixes.' },
              { n: '2', color: 'blue',   title: 'Community Validates', body: 'AppSec professionals review candidate fixes through a structured GitHub workflow. Is this a real vulnerability? Is this a good fix?' },
              { n: '3', color: 'purple', title: 'Tag & Score',         body: 'Validators annotate fixes. A credibility-weighted scoring system separates signal from noise — senior expertise carries more weight.' },
              { n: '4', color: 'green',  title: 'Submit Upstream',     body: 'Top-scoring fixes are offered to open-source maintainers carrying OASIS community endorsement — not raw AI output.' },
            ].map(step => (
              <div key={step.n} className="step-card">
                <div className={`step-number step-number--${step.color}`}>{step.n}</div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4 Steps — detailed */}
      <section className="section overview-steps-section">
        <div className="container">
          <h2 className="text-center overview-steps-title">The Workflow</h2>
          <div className="overview-steps">
            {steps.map(step => (
              <div key={step.n} className={`overview-step overview-step--${step.color}`}>
                <div className="overview-step-header">
                  <div className={`overview-step-num overview-step-num--${step.color}`}>{step.n}</div>
                  <h3>{step.title}</h3>
                  <span className={`badge badge-${step.color}`}>
                    {step.tag}
                  </span>
                </div>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GitHub link */}
      <section className="section-sm overview-github">
        <div className="container text-center">
          <h2>Full project documentation</h2>
          <p>
            The complete operating model, workflow states, roles, and design
            decisions are documented in the public GitHub project.
          </p>
          <a
            href="https://github.com/owasp-oasis/project-overview"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ display: 'inline-block', marginTop: 24 }}
          >
            View on GitHub
          </a>
        </div>
      </section>
    </div>
  )
}
