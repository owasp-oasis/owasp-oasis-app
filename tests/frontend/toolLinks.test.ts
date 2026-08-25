import { describe, expect, it } from 'vitest'
import { getToolUrl } from '../../src/pages/leaderboards/toolLinks.js'

describe('Workspace tool links', () => {
  it.each([
    ['AppSecAI', 'https://www.appsecai.io/'],
    ['Semgrep OSS', 'https://github.com/semgrep/semgrep'],
    ['Bandit', 'https://github.com/pycqa/bandit'],
    ['DryRun Security', 'https://www.dryrun.security/'],
    ['Metis', 'https://github.com/arm/metis'],
    ['OpenGrep', 'https://github.com/opengrep/opengrep'],
  ])('links %s to its canonical tool page', (name, expectedUrl) => {
    expect(getToolUrl(name)).toBe(expectedUrl)
  })

  it('supports shortened synced names and harmless spacing differences', () => {
    expect(getToolUrl('DryRun')).toBe('https://www.dryrun.security/')
    expect(getToolUrl('  Semgrep   OSS  ')).toBe('https://github.com/semgrep/semgrep')
  })

  it('does not invent a destination for aggregate or unknown cards', () => {
    expect(getToolUrl('Human Validators')).toBeNull()
    expect(getToolUrl('Unknown Scanner')).toBeNull()
  })
})
