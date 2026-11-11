import { describe, expect, it } from 'vitest'
import { hasUndismissedInvites, highestPendingInviteId } from '../../src/lib/teamInvitationDismissal.js'

describe('Team invitation notice dismissal', () => {
  it('uses the highest pending invitation id as the dismissal watermark', () => {
    expect(highestPendingInviteId([{ id: 2 }, { id: 8 }, { id: 5 }])).toBe(8)
    expect(highestPendingInviteId([])).toBeNull()
  })

  it('hides invitations at or below the dismissed watermark', () => {
    expect(hasUndismissedInvites([{ id: 2 }, { id: 8 }], 8)).toBe(false)
  })

  it('shows a later invitation after earlier invitations were dismissed', () => {
    const dismissedThrough = highestPendingInviteId([{ id: 2 }, { id: 8 }])
    expect(hasUndismissedInvites([{ id: 2 }, { id: 8 }], dismissedThrough)).toBe(false)
    expect(hasUndismissedInvites([{ id: 2 }, { id: 8 }, { id: 9 }], dismissedThrough)).toBe(true)
  })

  it('shows an invitation when no dismissal has been saved', () => {
    expect(hasUndismissedInvites([{ id: 2 }], null)).toBe(true)
  })

  it('does not show a notice when there are no pending invitations', () => {
    expect(hasUndismissedInvites([], null)).toBe(false)
  })
})
