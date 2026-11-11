# Unified repository management and maintainer workspace

Proposed implementation plan — 2026-11-01.

## Consolidated source and delivery goal

Use the Repo Ownership Model chat as the working home for decisions from both it and the pinned Plan maintainer view chat. The original chats remain source history; this document consolidates their requirements rather than claiming their transcripts have been merged.

Deliver one coordinated, functional manual workflow in one PR targeting preview. Organize the PR into reviewable commits with shared foundations first. This is a proposal for scope and sequencing, not authorization to deploy or merge.

The local stewardship prototype is on feat/repo-stewardship-workspace-mockup. The maintainer redesign is the Claude artifact linked from the Codex project thread “Plan maintainer view”; it is a design reference, not a second completed application branch. Its latest design has My repositories and Available fixes, a filtered list with an in-place detail panel, revision-specific decisions, an explicit upstream PR step, tracking, and required decline reasons. Custom exposure settings were deferred in that thread.

The combined local build is a front-end prototype. Its controls demonstrate proposed states and do not persist changes or call GitHub. It does not claim the backend workflow is implemented.

The main checkout associated with the maintainer chat contains substantial unrelated changes. Do not merge that checkout wholesale. Reuse reviewed components from current main and implement the accepted design in the isolated integration worktree. Current main and preview have diverged (4 main-only and 11 preview-only commits); inspect and reconcile target compatibility before opening the PR.

## Shared product model

- Identify people and repositories by immutable GitHub IDs. Link each OASIS fork to its upstream repository.
- Each fork has at most one active OASIS Repo Security Steward. Steward appointment remains an OASIS review decision.
- A Steward assigns named Repo Roles, edits assignments, removes assignments, and defines custom responsibilities. There is no generic Repo Member role. Custom roles cannot impersonate protected Steward or verified Maintainer roles or confer upstream privileges.
- A repository can have multiple verified upstream maintainers. Each maintainer self-connects through the Maintainer Workspace, including when no Steward exists. GitHub verifies Maintain or Admin access; there is one connection path and no separate Steward invitation or Write-only confirmation flow.
- The Steward can direct a prospective maintainer to that self-connection flow and can remove a registered maintainer from the OASIS repo roster. Removal ends the OASIS relationship only; it does not change GitHub permissions. Reconnection by a still-authorized maintainer follows the same GitHub verification.
- GitHub authority and OASIS capabilities remain distinct. Existing OAPP-248 permission behavior must be reconciled with this model before enabling upstream actions. Installation and shared connection settings retain their own GitHub permission requirements.
- Upstream maintainer recognition does not automatically grant OASIS-fork management access. Provisioning the Steward's proposed GitHub Maintain access is a separate, auditable operation; represent provisioning failures explicitly. Removing an OASIS relationship does not revoke unrelated upstream GitHub permissions.
- Contribution interests in OAPP-259 express intent and never create assignments. OASIS Teams remain a separate concept.

## Unified UX

Projects remains the shared repository entry point. Project About contains one Repo Management Team roster, including names, specific Repo Roles, verified maintainer status, and role definitions. Steward controls appear directly in that roster. The Steward can add, edit, and remove assigned Repo Roles, including removing a maintainer’s OASIS registration. A link opens the Maintainer Workspace for self-connection. Both Steward and Maintainer roles can belong to the same person.

Maintainer workspace has My repositories for connection/setup and Available fixes for everyday work. Use a single list with status tabs and repository, severity, and search filters. Open the existing fix detail/review panel in place. Keep selection, revision-specific approval, PR preview, explicit creation, and actual merge outcome distinct. Require a decline reason and retain author, time, and reviewed revision; expose the reason to the fix author and validators without claiming it was also posted to GitHub.

The current Workspace Maintainers route is an impact dashboard, not this work area. Introduce an unambiguous Maintainer workspace entry and preserve the existing impact view under an explicit impact label/location. Keep the analytics redesign (OAPP-229) outside this delivery. Do not create a separate Steward workspace.

Use GitHub Discussions for repository coordination and the relevant PR for fix-specific conversation. If Discussions are disabled, link to the repository issue tracker. Make public visibility clear; GitHub notifications follow user settings and are not guaranteed. Communication availability must not block role verification. The OASIS relationship record remains authoritative for registered roles. No private-message service is part of this workflow.

## OLLY coverage audit

Audit: hosted OASIS PM Scrapbook, 267 returned items including archived items; read descriptions and acceptance criteria of relevant records.

| Area | Existing records | Alignment required |
|---|---|---|
| Maintainer workflow | OAPP-247; stories OAPP-248 through OAPP-257 | Preserve epic; narrow first-PR scope to manual workflow. |
| Connection/permissions | OAPP-248 | Align self-connection with Maintain/Admin verification, roster synchronization, and explicit recognition versus operational permissions; no separate invitation or manual confirmation path. |
| Queue/detail UX | OAPP-249 | Rename/align to My repositories + Available fixes and compact detail panel; remove exposure-match requirements from first delivery. |
| Evidence and decisions | OAPP-251, OAPP-252 | Keep revision-bound approval and decline reasons; make author/validator visibility and all lifecycle states explicit. |
| Submission and tracking | OAPP-253, OAPP-254 | Reuse existing workflow endpoints and link canonical Fix IDs/revisions. |
| Fix identity/provenance | OAPP-268 feature | No child stories exist. Split into identity/revision, upstream linkage/provenance, and adoption reconciliation stories. |
| Steward request/appointment | None found | New stories needed. |
| Shared roster and Repo Role management | None found | New stories needed. |
| Maintainer self-connection and GitHub coordination | Partial connection coverage only | Extend verification and add roster removal and GitHub discussion/issues coordination coverage. |
| Shared navigation and both-role UX | No explicit cross-feature story found | New integration story needed. |
| Interests and impact analytics | OAPP-259 and OAPP-229 | Dependencies/context only; not equivalent to repository assignments or maintainer work. |

OAPP-250 still calls for custom exposure settings in phase 1; OAPP-247 still recommends automatic selection in the first release. This conflicts with the later simplified prototype direction. Proposed correction: retain these requirements for later delivery; exclude custom exposure settings (250), automatic selection (255), background App automation (256), and unattended submission (257) from this PR. Any GitHub App access needed for the manual workflow must still be resolved as part of connection/submission engineering.

## Draft missing stories

These are proposed story drafts, not yet separate OLLY story records.

1. Request and review Security Steward appointment. A signed-in user requests responsibility for an existing fork; OASIS reviewers approve/decline with history; concurrent approvals cannot appoint two Stewards; pending, declined, and approved states appear consistently.
2. Provision and maintain Steward responsibility. Record appointment separately from GitHub access provisioning; retry failures safely; support resignation/replacement without creating simultaneous Stewards; specify how existing role assignments are handed over rather than silently deleting them.
3. View the shared Repo Management Team. Show the same verified identities and named roles in project About and maintainer setup; support multiple maintainers, an unassigned Steward, both roles on one person, and read-only visitors.
4. Manage named Repo Roles. Only the assigned Steward or expressly authorized OASIS administrator may add/edit/remove assignments and custom role definitions. Server validation prevents duplicate active assignments and escalation to protected roles. Removing a responsibility does not remove public contribution rights or unrelated GitHub access.
5. Self-connect an upstream maintainer. The user connects through GitHub and is registered only after Maintain/Admin authority is verified. The Steward can share the workspace entry point and remove the resulting OASIS registration. Reconnection reuses the same verification. Extend OAPP-248 rather than duplicate its authorization rules.
6. Coordinate through GitHub. Users can open an existing repo coordination discussion or explicitly start one and mention the counterpart; show public visibility and notification limitations. Handle missing/disabled discussions and keep fix comments on the appropriate PR.
7. Navigate between repository and maintainer work. Repository-scoped deep links carry context to Available fixes and back; role-specific actions are consistent across entry points; non-maintainers get connection guidance; preserve the existing impact view.
8. Assign canonical Fix IDs and immutable revisions (child of 268). Backfill idempotently, preserve identity across source revisions/renames, link current PR records, retain earlier reviewed revisions, and update schema.sql with migrations.
9. Link upstream submissions and provenance (child of 268). Attach source/revision/destination identities, include references in generated PR descriptions, support verified external PR links, and preserve records when editable GitHub text changes.
10. Reconcile adoption evidence (child of 268). Confirm linked upstream PR merges; distinguish uncertain matches; allow authorized confirmation/dismissal; keep scans bounded and retry-safe. Proposed first-PR boundary is exact/linked evidence. Broader patch-equivalence detection remains in OAPP-268 for later delivery unless deliberately brought into scope.

## Implementation sequence within one PR

1. Reconcile OLLY acceptance criteria and agree the permission matrix. Publish this plan as the integration record; link 247, 268, and new story records without flattening their history.
2. Build additive shared models/APIs: fork/upstream mappings, immutable identities, role assignments, verified connections, canonical fix/revision identities, and audit events. Reuse current authentication and repository authorization conventions.
3. Implement server authorization, connection verification, single-Steward constraints, Repo Role management, and roster removal. Recheck GitHub authority at consequential operations. Bind maintainer workflow endpoints to verified repository capabilities rather than granting blanket application admin access.
4. Integrate the About roster, conditional controls, maintainer self-connection, shared navigation, and My repositories. Port approved prototype behavior into existing application components; remove demo-only state from the functional path.
5. Integrate Available fixes with existing review/Workflow components, explicit decisions, upstream PR preview/creation, duplicate prevention, and linked outcome tracking. Finish GitHub coordination links and user-initiated publication where supported.
6. Validate the whole journey and prepare one preview-targeted PR, with distinct commits for foundation, permissions, roster/navigation, maintainer workflow, and verification. Reconcile preview-specific changes deliberately; document any prerequisite branch synchronization separately from feature behavior.

## Verification and acceptance gate

Test repository isolation, immutable identity/rename behavior, single-Steward races, forged roles, CSRF, revoked permissions, invite retries, and custom-role escalation. Verify migration/backfill repeatability. Exercise source revision changes, decline reasons, unknown checks, duplicate upstream creation and timeout-after-success recovery, real merge/closure outcomes, and visibility rules.

Browser walkthroughs: visitor; Steward applicant; OASIS reviewer; appointed Steward; independent verified Maintainer with no Steward; invited Maintainer; user holding both roles; revoked-access user. Verify mobile/keyboard use and consistent repository deep links. Test external boundaries on controlled GitHub repositories before preview acceptance. Run npm run check on the final implementation and review migrations, authorization, and the PR template requirements.

Definition of ready for the PR: every in-scope story has an owner-approved acceptance criterion, the application workflow persists through reload, sensitive actions are enforced by the server, GitHub outcomes are verified, and outstanding prototype-only features are clearly identified. No claim of deployed or merged functionality follows from a local mockup or a green build alone.

## Deployment readiness issue ledger — 2026-11-11

This ledger captures the code-review findings and the order for resolving them. Keep it current across implementation and context handoffs. A UI-only patch does not satisfy the production-ready PR request.

### P0 — Do not present a client-side mockup as a live feature

- [ ] Replace hard-coded repository, validator, decision, and lifecycle data in the production route with authenticated API data.
- [ ] Persist every user decision server-side and show durable state after reload. Keep the mockup only behind an explicit development/demo flag if still needed.
- [ ] Implement GitHub OAuth/App authorization and server-side checks for repository connection, maintain/admin access, and upstream PR creation.
- [ ] Confirm role and access boundaries in `AUTHORIZATION.md`; unauthorized API calls must fail closed.
- [ ] Ensure every consequential action has an audit record and idempotency strategy.

### P1 — Correct review targeting and filters

- [x] Keep the selected fix within the visible filtered list in the prototype. The detail panel now follows a visible match or clears when there are no matches.
- [x] Implement severity filter state and make Clear filters reset query, repository, and severity consistently in the prototype.
- [ ] Preserve repository context in URL/deep links when entering Available fixes. Restore sensible context on browser back/forward.
- [ ] Add regression coverage for filter changes, empty results, lifecycle changes, and repository switching so an approval can never target a hidden fix. Current tests do not exercise this React component.

### P1 — Bind decisions to the exact fix revision

- [x] Bind decline/change request forms to the fix ID and revision/SHA opened; switching fixes closes the form and clears its target in the prototype.
- [ ] Validate action eligibility on the server against current revision and current lifecycle state; reject stale or duplicate decisions.
- [ ] Persist decline and change reasons with actor, timestamp, fix ID, and revision; verify the intended author/validator visibility and avoid claiming a GitHub comment was posted when it was not.
- [ ] Test stale revisions, repeated submission, double clicks, navigation while forms are open, and reload after submitting.

### P1 — Replace synthetic validation roster with attributable evidence

- [x] Source validator identities and votes from persisted records for the exact revision; remove index-based assignment of demo names to aggregate counts from the production route. New votes persist immutable GitHub user ID and head SHA (migration 0019); `/api/pr-panel/:id/validation-evidence` returns exact-SHA participants and profile context only to a currently verified maintainer or OASIS admin. Historical votes without a stored SHA remain explicitly unattributed. The production maintainer route reads this API; synthetic examples remain in the explicit demo route only.
- [ ] Ensure displayed participant counts exactly match the underlying records, including zero, missing, private, deleted, or partially available identities.
- [ ] Define and enforce which maintainers may see validator identity/profile signals; expose rationale only where consent and product policy permit it.
- [ ] Explain reputation/rank calculation, time window, freshness, and missing-data states; never imply reputation predicts correctness.
- [ ] Test exact-revision membership, privacy rules, count consistency, and changes between revisions.

### P1 — Make stewardship and maintainer records real and safe

- [x] Add migrations and APIs for Steward requests/appointment, immutable GitHub account/repository IDs, Repo Role assignments, verified maintainer registrations, decisions, and audit events (migrations 0018–0022; canonical PR identity/adoption reconciliation remains outside this implementation slice).
- [x] Enforce one active Security Steward per fork transactionally; reject concurrent pending requests and cover replacement/resignation semantics in Worker integration tests.
- [x] Permit multiple independent verified upstream maintainers, including when no Steward is appointed; keep GitHub permissions distinct from OASIS roster membership.
- [x] Validate GitHub identities and prevent duplicate assignments, protected-role impersonation, role escalation, and unauthorized edits/removals on the server.
- [x] Confirm Steward removal of a maintainer affects only OASIS registration and cannot revoke upstream GitHub access.
- [x] Test API authorization and cross-repository separation; live OAuth and controlled-GitHub permission/revocation tests remain required before production deployment.

### P1 — Implement lifecycle actions and GitHub boundaries

- [ ] Connect the manual maintainer workflow to existing `maintainer_decisions` and `upstream_submissions` tables/APIs after reviewing migrations and handlers.
- [ ] Keep approval, PR preparation, PR creation, and actual merge outcomes as distinct states. Approval applies only to the reviewed immutable revision.
- [ ] Prevent duplicate upstream PRs, including timeout-after-success retries; verify GitHub result before recording submission. Pending records now reconcile against GitHub by source PR, head repository/branch/SHA, and base; a unique match is linked and ambiguous matches require manual reconciliation. Verify the response-loss path against the worker runtime and a controlled GitHub repo.
- [ ] Keep generated PRs user-initiated and do not merge them on the user’s behalf. Track actual GitHub closure/merge state.
- [ ] Make connection failures, revoked permissions, unknown checks, deleted forks, and upstream branch changes actionable and non-destructive.
- [ ] Exercise a controlled GitHub repository for OAuth, permissions, PR creation, and outcome tracking before preview release.

### P2 — Finish role communication and UX accessibility

- [ ] Detect whether GitHub Discussions or Issues are enabled; present public visibility and notification limitations and provide an honest unavailable state.
- [ ] Keep coordination in GitHub; keep fix-specific discussion attached to the relevant upstream PR.
- [ ] Add clear loading, empty, error, retry, unauthorized, and stale-data states across both workspaces.
- [ ] Verify keyboard navigation, focus management for dialogs, screen-reader names/status, narrow layouts, and mobile table behavior.
- [ ] Remove demo wording only after server-backed behavior and boundaries above are proven; retain clear external-action confirmation and status copy.

### Cross-cutting test/use-case matrix

- [ ] Visitor/read-only user; signed-in contributor requesting Steward; OASIS reviewer approving/declining; appointed Steward managing roles; independent upstream Maintainer with no Steward; multiple maintainers; person holding both roles; removed/revoked maintainer; deleted/renamed repository; validator with no prior history; hidden/private validator profile; stale fix revision; GitHub unavailable/permission revoked.
- [ ] For each role, verify UI visibility and matching server authorization. Verify no action is possible by forging a request or replaying an old action.
- [ ] Verify data survives refresh and browser navigation, counts reconcile with source records, and the audit log explains who changed what and when.
- [ ] Run targeted integration tests, migration idempotence checks, `npm run check`, and a keyboard/mobile browser walkthrough. Record commands/results in the PR.

### PR gate and delivery status

- [ ] Reconcile this branch with the intended current `preview` base and account for main/preview divergence before publishing. Preserve unrelated work in the current worktree.
- [ ] Confirm every in-scope OLLY story/acceptance criterion and permission decision. The OLLY coverage audit above still identifies missing Steward/roster stories.
- [ ] Prepare atomic commits and a PR body with behavior, authorization model, migrations, test evidence, risks, and rollback notes.
- [ ] Create the preview-targeted PR only after all P0/P1 items are implemented and verified. No deployment or merge is included in this request.

### Current implementation progress and next slice

This branch implements the persisted Projects/About Repo Management Team and Maintainer Workspace paths. Feature migrations are numbered 0018–0022 because preview already owns migration 0017 (`validation_assessment_answers`). They add verified maintainer registrations with GitHub display names, revision-bound vote identity, Steward/Repo Role records, and soft-removal history. Worker APIs verify GitHub identities and current upstream repository permissions, enforce one Steward per repo, enforce Steward/admin authorization, preserve audit history, and allow role removal without changing GitHub access. The maintainer route uses persisted repositories, exact-revision validator evidence, workflow decisions, and upstream submission state; demo-only behavior remains on an explicit `?demo=1` route. Pending Steward requests have a cross-repository admin inbox in My queue, and requestors can see their own status there.

Verification on 2026-11-11: `npm run check` passed (36 test files, 455 tests, Worker TypeScript build, and Vite production build). Migrations 0018–0022 applied in order to an in-memory SQLite database created from `origin/preview:schema.sql`; `PRAGMA integrity_check` returned `ok`. An anonymous browser smoke check on `http://127.0.0.1:5180` loaded Project About for repo 1001 and the Maintainer Workspace sign-in state without an application alert. The analytics pageview request returned a local 403 in the browser console and is not part of these feature checks.

This is ready for code review but is not yet production-ready for deployment. A controlled signed-in GitHub OAuth/permission/PR-creation walkthrough has not been run. The proposed GitHub `Maintain` grant for a Security Steward is not implemented; the current roster records OASIS responsibility only and must not imply GitHub access. In-app request status is available in My queue, but OASIS sends no email/push notification. GitHub coordination currently opens a public issue URL without checking whether Issues are enabled. OLLY acceptance criteria and missing Steward/roster stories still need owner-approved updates. The feature branch still must be merged with the current `preview` target, checked, and pushed before opening a preview PR. Browser testing was anonymous only on this worktree's `http://127.0.0.1:5180`; the browser's pre-existing `5173` runtime uses a stale local schema. Do not migrate that other local database as part of this work.
