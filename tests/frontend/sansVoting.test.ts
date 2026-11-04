import { describe, expect, it } from 'vitest'
import { isSansVotingOpen } from '../../src/lib/sansVoting'

describe('SANS voting notice', () => {
  it('stays visible through November 9 Pacific time and ends at midnight', () => {
    expect(isSansVotingOpen(Date.parse('2026-11-09T23:59:59-08:00'))).toBe(true)
    expect(isSansVotingOpen(Date.parse('2026-11-10T00:00:00-08:00'))).toBe(false)
    expect(isSansVotingOpen(Date.parse('2026-11-10T00:00:01-08:00'))).toBe(false)
  })
})
