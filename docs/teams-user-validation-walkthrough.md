# OASIS Teams — user validation walkthrough

Use this script against the local preview at
http://127.0.0.1:4175/workspace/teams. The preview uses synthetic personas and
an isolated in-memory database. It is safe for testing, but restarting the
preview resets its sample data.

## What to validate

The Team experience should make it easy to:

- create a Team and choose a simple logo;
- find Teams and understand their achievement and recent activity;
- manage members, invitations, join requests, and roles;
- choose repository focus;
- inspect Team stats and activity; and
- earn a membership badge and understand the contribution badge bar; and
- change Team settings without exposing private member data.

## Personas

Use the yellow preview toolbar to switch personas:

- `owner`: owns Python security reviewers and can manage the Team;
- `admin`: manages members and repositories but cannot transfer ownership;
- `member`: can see the member workspace but cannot manage other members;
- `newcomer`: has a pending join request; and
- `public`: is signed out and sees only public Team information.

## Walkthrough

### 1. Create a Team

1. As `owner`, open **Your teams** and select **Create team**.
2. Enter a memorable name and optional description.
3. Choose a logo such as **Shield**.
4. Leave membership as **By invitation only** and create the Team.

Expected: the new Team opens immediately, the selected mark appears beside
its name, and the left-hand Team menu contains Stats & activity, Members,
Repository focus, and Team administration.

### 2. Explore the public directory

1. Return to Teams and open **Explore teams**.
2. Check the Team leaderboard in **All time** mode.
3. Switch to **Last 90 days**.
4. Search for the Team you created and open it.
5. Switch to the `public` persona.

Expected: both leaderboard modes are understandable; recent activity shows
validations and per-active-contributor context; the Team logo is visible in the
directory; public visitors see aggregate stats but not roster or individual
activity.

### 3. Invite and manage members

1. Switch back to `owner` and open the Team’s **Members** section.
2. Invite a synthetic GitHub username.
3. Confirm the invitation appears under **Pending invitations**.
4. Switch to the invited persona when available and accept from **Your teams**.
5. As `owner`, open **Manage** for the new member and promote them to admin.
6. Confirm that removal requires a confirmation dialog; cancel it.

Expected: invitations are clear, acceptance adds the member, role changes are
visible, and cancelling removal makes no change. The former owner remains the
only person who can transfer ownership.

### 4. Review join requests

1. Switch to `newcomer` and open the open-membership sample Team.
2. Request to join.
3. Switch to `owner` and open **Members**.
4. Accept or decline the request.

Expected: the requester sees a pending state; owners/admins see the request
count in the left menu and can resolve it; acceptance adds the requester to the
private workspace.

### 5. Choose repository focus

1. As `owner` or `admin`, open **Repository focus**.
2. Filter the repository list and add one repository.
3. Confirm it appears under **Focused repositories**.
4. Refresh the page and follow **Find reviews**.

Expected: the focused repository persists, the action remains available after
refresh, and the pull-request workspace opens with the repository filter.

### 6. Check administration and lifecycle

1. Open **Team administration**.
2. Change the description or membership mode and save.
3. Change the contribution badge bar to a supported value and save.
4. Change the logo and save; confirm the header updates.
5. As owner, open ownership transfer and verify only current members are
   offered as candidates.
6. Open the archive confirmation, then cancel it.

Expected: settings remain separate from daily activity, changes are explicit,
the badge bar offers only OASIS-approved thresholds, and cancelling destructive
actions leaves the Team unchanged.

### 7. Check Team badges

1. As a current member, open **Stats & activity**.
2. Confirm **Your Team badges** shows the membership badge.
3. After enough validations attributed to the Team, confirm the contribution
   milestone badge appears.
4. Return to **Team administration** and raise the contribution bar.

Expected: badges are awarded automatically from verified Team-attributed work;
the membership badge does not require a contribution; earned badges remain
visible after the threshold changes; and badge details stay inside the member
workspace in this MVP.

## Record findings

For each step, record:

- what you expected;
- what actually happened;
- anything confusing or visually crowded;
- whether the next action was obvious; and
- a screenshot or URL when something needs correction.

Do not use production GitHub accounts or real invitations in this preview.
