# OASIS Teams — feature brief

## Slack-ready summary

> **OASIS Teams** gives members a lightweight way to review security work
> together while keeping individual ownership clear. Members can create or
> discover Teams, invite people or request to join, focus a Team on repositories,
> and see aggregate impact through activity and achievement rankings. Verified
> Team-attributed work earns recognition badges, with privacy controls for any
> public display. The implementation is on the `feat/teams` branch and has been
> validated locally; preview integration and deployment are still pending.

## Overall goal

Teams are a coordination and reporting layer around existing OASIS validation
work. They answer three questions without turning OASIS into a corporate
workspace:

1. Who is working together?
2. How can someone participate?
3. What difference is the Team making?

The central rule is that a member's work remains theirs. A member can choose a
Team when submitting a validation so the work contributes to that Team's totals,
but one validation cannot be counted for multiple Teams.

## Implemented feature stories

### Create and discover Teams

- Any signed-in OASIS member can create a Team with a unique name and optional
  description.
- The Teams homepage has stable **Your teams** and **Explore teams** views.
- The public directory shows discoverable Teams, member count, aggregate
  activity, repository focus, and achievement signals without exposing private
  member activity.
- Team creation opens the new Team workspace immediately, so the Team is not
  lost after creation.

### Membership and administration

- A Team is **Invite only** by default, with an **Open membership** option.
- Owners and Team admins can invite members, approve or decline join requests,
  and manage the roster.
- Team roles are owner, admin, and member.
- Ownership can be transferred to an existing member with acceptance; the former
  owner remains a member.
- Teams can be archived and reactivated without losing membership, attribution,
  activity, or badges. Archived Teams pause new membership, invitations, and
  attribution.

### Member and repository workflows

- Member invitations use inline live search: type at least two characters and
  matching eligible handles appear directly below the field.
- Repository focus uses the same inline search pattern: type part of a
  repository name, choose a result, and add it without a separate dropdown
  step.
- Existing members, pending invitations, and already-focused repositories are
  removed from the relevant suggestions.

### Stats, activity, and achievement

- Team totals include attributed validations and accepted-upstream reviews.
- Aggregate Team stats are public; roster details, detailed activity, and
  repository focus remain member-only.
- The Team leaderboard supports all-time achievement and a recent 90-day view.
  All-time ranking uses accepted-upstream reviews first, with attributed
  validations as a tie-breaker. The recent view shows current activity and rate
  per active contributor.

### Team identity

- A Team can use one logo source at a time: an OASIS-provided icon or a custom
  uploaded image.
- The Team homepage can also have an optional uploaded banner.
- Owners and admins can change or remove these visuals from Team
  administration. The UI includes initials and safe built-in marks as fallbacks.

### Badges and recognition

- Joining a Team awards a membership badge.
- OASIS owns the contribution badge definitions. A Team admin selects one of the
  supported contribution bars (3, 5, 10, or 25 Team-attributed validations).
- Contribution badges are awarded automatically from verified attributed work.
  Earned badges remain earned if the Team later changes its threshold.
- Badge details are private by default. Public display requires both a Team
  admin setting and the individual member's opt-in.

### UX and navigation

- Team workspaces use a persistent left-side menu for **Stats & activity**,
  **Members**, **Repository focus**, and **Team administration**.
- Workspace navigation and the OASIS Workspace banner remain stable when moving
  between Teams and the other Workspace tabs.
- The maintainer dashboard's obsolete TODO banner has been removed from the
  product UI.

## High-level implementation

- **Frontend:** React Workspace pages and shared Team components implement the
  homepage, Team workspace, left navigation, live member/repository search,
  logo/banner controls, badges, and stable tab layout.
- **Server:** Cloudflare Worker routes under `/api/teams` enforce membership,
  owner/admin permissions, attribution rules, validation, and privacy boundaries.
- **Data:** D1 migrations `0007_teams.sql` through `0011_team_media.sql` add
  Teams, memberships, invitations, join requests, repositories, ownership
  transfers, badge settings/awards, public badge preferences, and Team media.
- **Media:** Logo and banner uploads are currently bounded and validated data
  URLs. Dedicated object storage can replace this transport later without
  changing the product model.
- **Tracked OASIS work:** PM Scrapbook epic **#216 Teams**, feature **#217
  Select and manage a Team logo**, epic **#219 Team badges and recognition**,
  and the related custom-icon work item **#227**.

## Scope deliberately kept out of this release

Corporate or company-verified Teams, private corporate workspaces, Team goals,
Team chat, arbitrary custom badge authoring, notifications, and cross-Team
attribution are not part of this implementation.

## Validation and release status

- Latest automated check: **316 tests passed across 19 files**, and the
  production build passed.
- Browser validation covered Team creation, logo/banner selection, member
  invite search, open-membership join requests, repository search, Team
  administration, badges, public-display opt-in, archive/reactivate, and stable
  Workspace navigation.
- A disposable local D1 migration test applied all 11 migrations and exercised
  the Team and existing leaderboard endpoints. Existing repository, pull
  request, and vote rows were preserved.
- The implementation is committed on branch `feat/teams`. It has not been
  pushed, merged, or deployed. The next release step is integration with the
  current `preview` branch, followed by preview validation and the normal
  `preview` → `main` release review.

## Validation guide

For a step-by-step walkthrough, use
[`teams-user-validation-walkthrough.md`](teams-user-validation-walkthrough.md).
The product intent and detailed rules are captured in
[`teams-feature-intent.md`](teams-feature-intent.md), with UX verification notes
in [`teams-ux-validation.md`](teams-ux-validation.md).
