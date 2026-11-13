// Voting is advertised through November 9, 2026. End the notice at midnight Pacific time.
export const SANS_VOTING_END = Date.parse('2026-11-10T00:00:00-08:00')

export function isSansVotingOpen(now = Date.now()): boolean {
  return now < SANS_VOTING_END
}
