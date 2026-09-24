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
- Team creation offers a curated logo picker or an optional custom image,
  previewed before creation. Team administration supports logo replacement/removal
  and homepage banner uploads. Logos appear in the directory, both leaderboard
  periods, and Team header, with built-in marks or initials as the fallback.
- Current members see a Team badge collection. Owners/admins can set the
  contribution badge bar to 3, 5, 10, or 25 attributed validations; earned
  badges remain after threshold changes.
- Public badge display requires both a Team-admin setting and member opt-in;
  eligible badges then appear in the member's public contributor panel.
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

- `npm run check`: 302 tests passed across 18 files; frontend and Worker builds
  passed. Existing large-bundle and runtime deprecation warnings remain.
- Desktop browser: checked the sidebar, expanded member management, invitation
  creation, repository addition, administration layout, and repository/section
  persistence after refresh. A newly created team appeared in Your teams.
- Narrow-screen CSS is implemented, but the in-app browser viewport override
  did not change the measured viewport, so phone-size rendering still needs
  manual validation.

## Custom logo validation on 2026-09-24

- `npm run check`: 306 tests passed; frontend and Worker builds passed.
- Browser checks on a separate local preview at port 4176: selected a custom
  PNG during creation, removed/reselected it, created the team, and confirmed
  loaded images in the header, Your teams, Explore teams, and both leaderboard
  periods. Removed the saved logo and confirmed initials returned in the header,
  directory, and leaderboard without a page reload.
- API tests cover logo fields in all four list responses and removal. Browser
  API unit tests cover successful creation/upload, creation rejection, no-logo
  creation, and upload rejection after successful creation without duplicate
  creation. Upload-failure recovery was not manually simulated in the browser.
- Port 4175 remains the earlier running Worker so its walkthrough data is
  preserved. Use port 4176 for the updated API and frontend together.

### Logo source and banner follow-up

- Creation and administration now show a single logo source: Choose an icon or
  Custom image. Only its relevant control is displayed. Creation also offers an
  independent optional homepage banner.
- `npm run check`: 309 tests passed with builds. Added coverage for banner-only
  creation and partial upload failures in either direction.
- Browser verified selecting Custom image hides the icon picker, creation with
  both uploaded images renders the logo and banner, and switching an existing
  custom logo to Shield through Save changes persists after reload while keeping
  the banner. The updated creation form is open on port 4176 for user review.
