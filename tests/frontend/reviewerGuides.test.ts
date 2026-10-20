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
  })

  it('serves the Reviewer Guide route with review guidance and a Quick Start path', () => {
    const html = renderAt('/reviewer-guide')
    expect(html).toContain('<h1>Reviewer Guide</h1>')
    expect(html).toContain('<h2>Review questions</h2>')
    expect(html).toContain('Finding validity')
    expect(html).toContain('Validation and maintainer actions are separate')
    expect(html).toContain('href="/quick-start"')
  })

  it('exposes Quick Start and the deeper guide from Candidate Fixes', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ReviewerOnboardingPrompt)))
    expect(html).toContain('New to reviewing?')
    expect(html).toContain('href="/quick-start"')
    expect(html).toContain('href="/reviewer-guide"')
  })
})
