# Workspace v3 implementation

The user approved implementation of the supplied OASIS Workspace v3 handoff.
Related issues: #63 (Workspace decomposition), #84/#90 (visual consistency),
#96 (first-team creation), and #97 (top-level Dashboard navigation).

## Base and boundaries

`feat/workspace-v3` starts at main ee87d84 and locally integrates preview
55d0d91, which supplies Teams, response badges, and maintainer workflows.
The original local-docker-dev checkout and its uncommitted work are untouched.
The integration commit is separate from the redesign. Review this branch into
preview; promotion to main requires an explicitly authorized reviewed PR.

Reuse the existing Teams API, vote endpoint, server role checks, badge rules,
and PR-body/diff renderers. No new Team role or scoring policy is introduced.

## Acceptance checks

- Shared 64px navigation and responsive Workspace sidebar; legacy links retain
  filters and reach canonical routes.
- My queue uses actual votes and preferences; no fabricated ranks or counts.
- Split, Table, and Focus share one review panel, persistent selected tab,
  abortable data requests, per-fix drafts, and auto-advance after a vote.
- Repository, CWE, severity, closed/voted, layout, diff, and keyboard defaults
  persist per signed-in user with authenticated and CSRF-protected writes.
- Team create, public/member/owner/admin views, invitations, search, repository
  focus, privacy settings, badges, media, and archive/reactivate remain functional.
- Keyboard navigation, modal focus management, narrow screens, reduced motion,
  loading, empty, error, and retry states are exercised locally.
- Automated tests and production builds pass. Browser evidence uses only local
  synthetic data. Real OAuth/GitHub writes and preview deployment are remaining
  staging checks, not implied by a local pass.

## Data and rollback

Migration 0016 adds workspace_preferences independently of onboarding and badge
privacy. It is idempotent and does not rewrite existing rows. Apply before
serving the new preference endpoint through the normal approved migration path.
Reverting the UI/API can leave the table intact; no destructive rollback needed.
