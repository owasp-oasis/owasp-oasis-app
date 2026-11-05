import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { guideRoutes } from '../../src/pages/GuideRoutes'
import ReviewerOnboardingPrompt from '../../src/pages/workspace/ReviewerOnboardingPrompt'

function renderAt(path: string) {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] },
    createElement(Routes, null, ...guideRoutes)))
}

describe('reviewer onboarding guides', () => {
  it('serves the Quick Start route with semantic content and a Reviewer Guide path', () => {
    const html = renderAt('/quick-start')
    expect(html).toContain('<h1>Quick Start</h1>')
    expect(html).toContain('An OWASP Slack account is optional')
    expect(html).toContain('Is the reported problem supported by the available evidence?')
    expect(html).toContain('href="/reviewer-guide"')
    expect(html).toContain('href="/worked-example"')
    expect(html).toContain('<h2>Submit your vote</h2>')
    expect(html).not.toContain('Record a decision when you have enough support')
  })

  it('serves the Reviewer Guide route with review guidance and a Quick Start path', () => {
    const html = renderAt('/reviewer-guide')
    expect(html).toContain('<h1>Reviewer Guide</h1>')
    expect(html).toContain('<h2>Review questions</h2>')
    expect(html).toContain('Finding validity')
    expect(html).toContain('Validation and maintainer actions are separate')
    expect(html).toContain('href="/quick-start"')
    expect(html).toContain('href="/worked-example"')
  })

  it('serves the Worked Example with current validation fields and bounded outcome language', () => {
    const html = renderAt('/worked-example')
    expect(html).toContain('<h1>Worked Example</h1>')
    expect(html).toContain('Decision:</strong> Modify')
    expect(html).toContain('Confidence:</strong> Medium')
    expect(html).toContain('Recommended action:</strong> Revise')
    expect(html).toContain('OASIS validation is community input')
    expect(html).toContain('href="/quick-start"')
    expect(html).toContain('href="/reviewer-guide"')
  })

  it('exposes Quick Start and the deeper guide from Candidate Fixes', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ReviewerOnboardingPrompt)))
    expect(html).toContain('New to reviewing?')
    expect(html).toContain('href="/quick-start"')
    expect(html).toContain('href="/reviewer-guide"')
    expect(html).toContain('href="/worked-example"')
  })
})
