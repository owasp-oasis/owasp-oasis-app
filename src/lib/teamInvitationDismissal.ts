type PendingInviteId = { id: number }

export function highestPendingInviteId(invites: readonly PendingInviteId[]): number | null {
  let highest: number | null = null
  for (const invite of invites) {
    if (Number.isSafeInteger(invite.id) && invite.id > 0 && (highest === null || invite.id > highest)) {
      highest = invite.id
    }
  }
  return highest
}

export function hasUndismissedInvites(invites: readonly PendingInviteId[], dismissedThroughId: number | null): boolean {
  return invites.some(invite => !Number.isSafeInteger(invite.id) || invite.id <= 0 || dismissedThroughId === null || invite.id > dismissedThroughId)
}
