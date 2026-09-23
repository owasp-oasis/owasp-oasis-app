# Teams UX preview

Run `npm run preview:teams`, then open http://127.0.0.1:4175/workspace/teams.
This runs the built application and actual Worker handlers with isolated,
in-memory D1/KV and synthetic signed-in users. It uses Miniflare supplied by
the existing Wrangler tooling. Restarting the process resets all sample data.
It never reads production data, authenticates with GitHub, or sends invitations
outside OASIS. Outbound Worker requests are blocked. This is not a deployment.

## Navigation

- Your teams is the signed-in landing view; Explore teams is the public directory.
- Creation opens the new team's workspace immediately. Back to Teams includes it
  in Your teams. The selected team and section are retained in the URL.
- The left menu separates Stats & activity, Members, Repository focus, and
  Team administration. On small screens, a labelled section selector replaces it.
- Team creation and Team administration offer a curated logo picker. Teams
  without a selected mark use generated initials.
- Explore teams includes an all-time leaderboard and a Last 90 days activity
  view with validations-per-active-contributor context.
- Members contains invitations, join requests, the searchable roster, and role
  management. Administration is available to owners/admins; ownership transfer
  and archive/reactivate remain owner-only.

## Review checklist

1. Create a team, return to Your teams, and refresh. Confirm the team remains.
2. Move between all four sections; use Back, Forward, and refresh a section.
3. Invite a synthetic username. Confirm Pending invitations updates. Switch to
   that sample persona to accept from Your teams.
4. Open Manage beside a member; check owner-only role actions and removal
   confirmation. Cancel must leave membership unchanged.
5. Select a logo while creating a Team, then replace it from Team administration.
   Confirm the mark appears in the Team workspace and directory; reset to
   Initials and confirm the fallback.
6. Switch the Explore teams leaderboard between All time and Last 90 days.
   Confirm the period label, rank, and recent activity context update.
7. Search/add a focused repository. Confirm it remains on refresh and Find
   reviews opens the existing repository-filtered pull request workspace.
8. Check admin/member/public personas. Members cannot manage others; public
   visitors see aggregate stats, not the roster or individual activity.
9. Review at desktop and phone widths: section navigation remains available,
   forms and rows fit, and key actions have visible labels and focus indicators.

The persona toolbar is injected only by the local harness. Switching a persona
affects other preview tabs on refresh because the cookie is shared. GitHub
OAuth and real upstream pull requests require separate environment validation.

## Validation on 2026-09-22

- `npm run check`: 300 tests passed across 18 files; frontend and Worker builds
  passed. Existing large-bundle and runtime deprecation warnings remain.
- Desktop browser: checked the sidebar, expanded member management, invitation
  creation, repository addition, administration layout, and repository/section
  persistence after refresh. A newly created team appeared in Your teams.
- Narrow-screen CSS is implemented, but the in-app browser viewport override
  did not change the measured viewport, so phone-size rendering still needs
  manual validation.
