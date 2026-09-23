# OASIS Teams — feature intent

## Why Teams exist

Teams give OASIS members a lightweight way to coordinate validation work and
see the impact they are creating together. A Team is a community and reporting
layer around individual work, not a replacement for individual ownership:
every validation remains the contributor’s work, and choosing whether to
attribute it to a Team is personal.

The feature should help members answer three questions quickly:

1. **Who is working together?** Find Teams by name, description, repository
   focus, and public achievement.
2. **How can I participate?** Join by invitation, or request membership when
   a Team has chosen open membership.
3. **What difference are we making?** See public aggregate totals and
   achievement rankings without exposing private member activity.

## Product model

- Any signed-in OASIS member can create a Team with a unique name, short
  description, membership mode, and optional curated logo.
- Membership is invite-only by default. A Team may instead enable **Open
  membership**, which lets any OASIS member request to join; an owner or admin
  approves or declines the request.
- Teams have three roles: owner, admin, and member. Owners can transfer
  ownership to an existing member, and the recipient must accept. The former
  owner remains a member.
- A member may attribute a validation to one Team or leave it personal. A
  contribution cannot count toward multiple Teams, and the choice is locked
  after submission.
- Joining a Team awards a membership badge. OASIS-defined contribution badges
  are awarded automatically when a member reaches the Team’s configured bar.
  Owners/admins can choose only from OASIS-approved thresholds (3, 5, 10, or
  25 attributed validations); earned badges are never revoked when the bar
  changes.
- Owners and admins manage members, invitations, join requests, repository
  focus, Team details, and the logo. Ownership transfer and archive/reactivate
  remain owner-only actions.

## Visibility and trust boundary

The directory and Team statistics are public so Teams can be discovered and
their collective impact can be understood. Public information includes member
count, attributed validations, reviews later accepted upstream, logos, and
leaderboard results.

The roster, detailed activity, repository focus, and individual attribution
remain available only to current members. This keeps the Team useful for
coordination without turning individual activity into a public scoreboard.
The current badge collection follows the same member-only boundary; public
badge/profile surfaces and user-controlled public display are intentionally
deferred until those surfaces exist.

## Experience intent

The Teams homepage is a stable Workspace surface with two simple views:

- **Your teams**: memberships, invitations, pending join requests, and Team
  creation.
- **Explore teams**: search, public directory, and all-time or recent-activity
  leaderboard.

Selecting a Team opens its workspace. The workspace keeps navigation in a
left-side menu so members can move among Stats & activity, Members, Repository
focus, and Team administration without losing the Team context. Switching
Workspace tabs should preserve the surrounding page position wherever possible;
only the essential content changes.

The Team logo is a small identity aid, not a branding system. The MVP uses a
fixed set of safe built-in marks and falls back to generated initials when no
logo is selected. Owners and admins can change or remove the mark from Team
administration.

Team badges are recognition, not a second leaderboard. OASIS owns the badge
definitions and minimum floor, Team owners/admins choose a bounded contribution
bar, and the system awards badges from verified Team-attributed work. The
first release has one membership badge and one contribution milestone badge;
arbitrary custom badge authoring is deferred.

## Achievement model

The leaderboard is intended to reward durable, useful security work rather than
raw activity volume:

- **All time** ranks Teams by reviews on pull requests later accepted upstream,
  with attributed validations as the tie-breaker.
- **Last 90 days** shows recent attributed validations and the rate per active
  contributor, providing context for Team size and recent momentum.

These are Team-level signals. They do not publish the identities or detailed
activity of individual contributors.

## Lifecycle and safety

Teams can be archived and later reactivated. Archiving pauses new membership,
invitations, and new attribution while preserving members, repositories, logos,
and history. OASIS administrators retain the ability to suspend or archive a
Team for safety or policy reasons.

## Deliberate non-goals

This epic does not implement corporate Teams, company verification, private
corporate workspaces, company demand or bounty programs, public rosters,
Team-owned claims or assignments, a separate Team work queue, Team goals, chat,
or notifications. These can be considered later without changing the core
individual-work and privacy model.

## Traceability

- **OASIS PM Scrapbook epic #216 — Teams:** source of the collaboration,
  attribution, privacy, role, lifecycle, repository-focus, and leaderboard
  intent.
- **OASIS PM Scrapbook feature #217 — Select and manage a Team logo:** adds the
  optional curated logo flow, consistent display, initials fallback, and safe
  built-in mark constraint.
- **OASIS PM Scrapbook epic #219 — Team badges and recognition:** tracks
  membership badges, bounded contribution thresholds, automatic awarding, and
  privacy-aware badge display.
- **Implementation:** Team directory/workspace, membership workflows, roles,
  repository focus, stats/activity, lifecycle, logo selection, and leaderboard
  views described above.
