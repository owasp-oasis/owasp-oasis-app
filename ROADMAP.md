# OASIS product and operations roadmap

Last reviewed: 2026-08-25

This file is the durable backlog for work that is planned, partially implemented, or intentionally waiting on an operational gate. Update the status and acceptance criteria here when work starts or lands so feature intent does not remain only in issues, branch names, or conversations.

## Operating rules

- Keep production changes atomic, independently revertible, and documented with verification and rollback scope.
- Keep the legacy Workspace cron authoritative until the shadow Workflow repeatedly produces the same result and is explicitly approved for cutover.
- Develop the analytics dashboard on its own feature branch after sync status is operational and stable.
- Never expose a username or other user-identifying value in administrative analytics. Usernames may appear only in the user's own profile and the existing contributor panel.
- Administrative engagement metrics must be aggregate-only. Do not provide individual event rows, stable user pseudonyms, or low-cardinality slices that allow an administrator to infer a person's identity.
- Apply D1 migrations before or with the Worker version that consumes them. Public operational pages must degrade gracefully if code and schema briefly differ during rollout.

## In implementation: free-tier bounded synchronization replacement

Current state:

- The public Workspace status page, job history, budget history, incomplete-run archive, and shadow parity system are implemented in `preview` and `integration/preview-main`.
- Migration `0007_sync_job_observability.sql` is applied to the shared remote D1 database.
- Feature branch `fix/free-tier-sync-orchestration` introduces the bounded canonical writer while keeping production scheduling disabled in D1 by default.
- The existing production synchronizer remains the scheduled path until the cutover flag is explicitly enabled and remains available as the first rollback path.
- Preview is shadow-only and runs one daily comparison against the shared canonical tables.
- Canonical collection is split into one-PR, one-comment-reaction, and one-duplicate-close Workflow instances. The application keeps each unit below the Cloudflare Workers Free ceiling, which the platform applies automatically; the Wrangler configuration intentionally omits paid-only custom runtime limits.
- A renewable D1 lease prevents overlapping canonical runs, and the public status page exposes the phase, lease, schedule gate, job history, and budgets.
- Production scheduling cannot be enabled until the latest shadow result records at least three consecutive matches and cutover eligibility.
- GitHub authentication failures terminate the shadow inventory and mark blocked downstream jobs instead of leaving them running indefinitely.

Exit criteria before cutover review:

- Complete repeated production shadow runs without unhandled errors.
- Reach three consecutive parity matches.
- Inspect every mismatch category and document any intentional difference.
- Confirm Workflow step, request, D1, and GitHub API budgets remain below their limits over the retained history.
- Prove orphan cleanup, duplicate projection, contributor scoring, comment/reaction processing, and upstream merge detection match the legacy results.
- Exercise rollback while the legacy cron remains available.
- Obtain an explicit cutover decision; eligibility shown on the status page is not automatic authorization.

Branch and deployment follow-up:

- `integration/preview-main` is the convergence tree containing current `main` News work plus the sync-status feature.
- Merge integration into `preview` only after the current preview validation is accepted.
- Promote the validated combined preview tree into `main` afterward.
- Integration and preview currently build the same Cloudflare preview Worker. Either give integration an isolated Worker or prevent competing branch builds before relying on it as an independent environment.
- After all three branch trees agree and production is verified, prune merged feature branches and preserve only intentional archive tags.

## Planned feature branch: administrative analytics

The status page tracks job health and operational budgets. Site analytics are a separate administrative product and must not be added to the status-page feature branch.

### Daily Cloudflare analytics archive

Build a daily scheduled collector that queries Cloudflare's analytics APIs for closed time windows and stores aggregate history in D1 before Cloudflare's online retention expires.

Required behavior:

- Collect the previous complete UTC day so late-arriving data does not produce partial totals.
- Use idempotent upserts keyed by date, zone/site, metric, and allowed aggregate dimensions.
- Record collector executions through the sync-job observability system under `cloudflare_analytics`.
- Track Cloudflare API calls, GraphQL/query cost where available, D1 reads/writes, and collector failures in the operational budget history.
- Backfill the available Cloudflare retention window when the feature is first enabled.
- Keep at least 100 days of detailed daily history. Define longer-term daily/monthly retention before launch so useful history survives beyond Cloudflare's native window.
- Store aggregate request, visit, response-status, bandwidth, cache, bot, geography, and performance measures only when the source API and privacy rules support them.
- Never archive IP addresses, raw user agents, authentication cookies, full referrers, or URL query strings.
- Normalize paths to approved route templates so identifiers and user-entered values cannot become analytics dimensions.
- Use a checkpoint table and bounded retry/backfill queue so one failed day is visible and recoverable without duplicating totals.

### Administrative dashboard

- Create an unlisted, authenticated administrative route separate from `/workspace/status`.
- Reuse the temporary server-enforced administrator role for initial access; do not put `ADMIN_SECRET` in browser code or local storage.
- Support selectable date ranges, comparisons with the preceding period, and daily/weekly/monthly aggregation.
- Show site usage, route usage, availability, error rates, cache performance, Worker performance, and operational-budget trends.
- Clearly distinguish measured values from estimates supplied by Cloudflare.
- Suppress empty, incomplete, or still-collecting periods rather than presenting them as zero.
- Provide data freshness, collector status, and backfill state on every view.

### Replace the temporary application-role layer

- Replace the rudimentary D1 role assignment with a reviewed identity and permission model before administrative capabilities expand materially.
- Define permissions as capabilities instead of continuing to hard-code role names at each endpoint.
- Add an authenticated, audited role-administration workflow with protection against removing the final administrator.
- Require recent authentication or equivalent step-up verification for high-impact actions.
- Define audit retention, inspection, and alerting rules; keep privileged action details free of tokens and sensitive payloads.
- Migrate immutable GitHub user IDs and existing role grants without falling back to mutable logins after legacy sessions expire.

## Planned feature branch: privacy-safe validation engagement metrics

Current data is insufficient: OASIS records vote timestamps and authentication-session creation/expiry, but it does not record when a reviewer opens a PR, actively reviews it, becomes idle, or closes the panel. Review duration cannot currently be reconstructed reliably.

Collection plan:

- Emit bounded events for review opened, active heartbeat, vote submitted, and review closed.
- Measure active time, not wall-clock tab-open time. Stop counting after an explicit idle threshold and when the page is hidden.
- Cap individual active intervals to reject abandoned tabs and corrupted clients.
- Record route/PR/tool/project categories needed for aggregate analysis, but do not place a GitHub login in analytics event or aggregate tables.
- Do not collect keystrokes, comment drafts, diff contents, IP addresses, or raw user agents.
- Treat vote submission in the canonical vote tables as the authoritative outcome; engagement telemetry is performance context only.
- Make ingestion idempotent and rate-limited, and publish its request/write budget through operational metrics.
- Aggregate promptly by day and approved cohort, then delete short-lived event-level telemetry on a documented schedule.

Privacy and display requirements:

- Administrative APIs return aggregates only; they must never return individual rows or a stable per-user pseudonym.
- Apply minimum cohort-size suppression before returning a slice. Start with a minimum of five contributors and review the threshold before launch.
- Coarsen time buckets and dimensions when a combination could single out a person.
- Do not allow arbitrary cross-filtering that can reduce an aggregate to one contributor.
- Profile and contributor panels may continue to identify the relevant user, but analytics dashboards may not reuse those identifiable endpoints.
- Document the metric definitions, idle rules, suppression rules, retention, and known biases on the dashboard.

Initial aggregate measures:

- Review sessions, active review minutes, and median/p75 active duration.
- PRs opened for review, PRs voted on, and open-to-vote conversion.
- Time from first active review to vote, grouped only across sufficiently large cohorts.
- Validation decisions and completion rates by project, language, severity, tool, and time period when cohort suppression permits.
- Repeat participation and contributor retention as aggregate cohort rates, never as named-user histories.
- Upstream acceptance and time-to-merge relationships after merge detection is made reliable.

## Partially implemented product work

### Preference-driven PR filtering

Language and severity preferences are stored, loaded, and passed into the PR Workspace, but the component currently reserves them without filtering results.

Acceptance criteria:

- Apply preferences to the visible PR set on initial load.
- Provide visible filter controls that can override onboarding preferences.
- Persist direct-linkable filter state in the URL.
- Make clearing filters explicit and preserve the project/repository filter.
- Cover combinations of project, language, severity, text, and vote-state filters.

### Maintainers Workspace redesign

The current submitted/merged table is explicitly provisional and does not yet tell a useful maintainer-impact story.

Candidate measures after upstream data is reliable:

- Maintainer responsiveness and median time to first upstream action.
- Project acceptance rate and median time to merge.
- Requested-changes and closure outcomes.
- Relationship between community validation and upstream acceptance.

Do not redesign this page around unreliable exact-SHA merge detection.

### Trust-status criteria

The current Trusted rule uses ten participants and a 75 percent Accept rate. These thresholds are active but explicitly unratified.

- Review and ratify the thresholds with the OASIS community.
- Move ratified policy into a documented server-owned configuration instead of duplicating presentation constants.
- Version policy changes so historical status can be interpreted correctly.

### Upstream outcome detection

Current merge detection recognizes only an exact head commit SHA in the upstream repository.

- Detect squash merges, rebases, and cherry-picks without generating false acceptance.
- Use upstream PR/issue events to distinguish author, maintainer, and bot closures.
- Add `closed_by` and `closed_at` only through a migration and backfill plan.
- Revisit Withdrawn and Accepted classification after this evidence exists.

### Launch content

- Replace the empty Business Wire URL in `NewsLaunch.tsx` when the live release is confirmed.
- Replace founder testimonial placeholders with approved third-party quotes.

### Test coverage

- Add Playwright coverage for authentication, Workspace navigation, onboarding, PR review, and voting.
- Add React component coverage for account navigation, preferences, PR filters, status views, and contributor panels.
- Add load/performance coverage for rate limiting, Workspace queries, sync scale, and analytics ingestion.

### Security follow-up

- Reduce the GitHub OAuth scope from `public_repo` if the required vote/comment operations can be supported with a narrower permission model.
- Replace CSP `unsafe-inline` allowances with nonces or hashes after confirming the Vite asset strategy.
- Remove the unused standalone `VoteModal` if no future caller is identified.

## Repository cleanup inventory

- There are currently no open pull requests.
- Remote feature branches whose commits are already reachable from integration are merged cleanup candidates.
- `chore/update-schema-for-leaderboards` is tagged `archive/superseded-schema-2026-08-24`; its unique schema commit is superseded.
- `merge-from-project-website` is tagged `archive/superseded-static-site-2026-08-24`; its static HTML/legacy Worker commit is superseded by the React/TypeScript application.
- The only local stash is a `.DS_Store` binary change from the superseded static-site branch. It contains no product work and may be discarded during the approved cleanup pass.

Do not delete branches or the stash until branch promotion is complete and the final cleanup targets have been reviewed explicitly.
