# CHANGELOG

## Versioning Scheme

OASIS uses **semantic versioning with calendar reset**: `YYYY.MM.RRR`

- **YYYY** — 4-digit year (e.g., 2026)
- **MM** — 2-digit month (01–12)
- **RRR** — 3-digit release counter within the month (001–999, reset to 001 on month boundary)

### Rules

1. **Every `git push` to `main` requires a stated version.** Include it in the commit message:
   ```
   git commit -m "feat: add validator onboarding survey (v2026.07.005)"
   ```

2. **Counter resets to `001` at the start of each new month.** If the last commit of June was `2026.06.047`, the first commit of July is `2026.07.001`.

3. **`CURRENT_ONBOARDING_VERSION` uses the same scheme** (in `worker/onboarding.ts`), but is only bumped when "What's New" content or the onboarding flow itself changes — not on every commit.

4. **Version is displayed in the footer** (small gray text, e.g., `v2026.07.005`) so users can report which version they're running.

---

## Release History

### [2026.07.005](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.07.005) — 2026-07-20

**Features:**
- **Validator Onboarding Workflow**: New modal that guides first-time validators through a survey to match them with PRs by language, severity, and experience level. Uses URL params to pre-filter leaderboards on completion.
- **User Preferences Storage**: New `user_preferences` table stores language/severity/experience filters and tracks which onboarding version each user has seen.
- **Versioned "What's New" System**: Admin-friendly release notes modal that can be published by bumping `CURRENT_ONBOARDING_VERSION` and updating hardcoded content. Users see it once per version.
- **Dismiss on What's New**: Clicking "Dismiss" marks the modal as seen without requiring survey completion or filter application.
- **Slack Community Links**: Added OWASP Slack channel link (`https://owasp.slack.com/archives/C0BJACRTT0T`) to Footer, Support page, and registration success message.
- **CHANGELOG.md**: Established versioning scheme and historical record of all releases.

**Files Changed:**
- Added: `CHANGELOG.md`, `schema.sql` (new `user_preferences` table), `worker/onboarding.ts`, `worker/handlers/preferences.ts`, `src/components/OnboardingModal/*`
- Modified: `worker/index.ts`, `src/context/AuthContext.tsx`, `src/App.tsx`, `src/pages/Leaderboards.tsx`, `src/pages/leaderboards/PRsTab.tsx`, `src/components/Footer.tsx`, `src/pages/Support.tsx`, `src/components/RegisterForm.tsx`, `src/components/Nav.tsx`

---

### [2026.07.004](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.07.004) — 2026-07-17

**Features:**
- **OWASP Project Status Update**: Updated all references across the site to reflect that OASIS is now an officially accepted OWASP project (no longer "proposed" or "seeking approval").
- **Updated Team Bios**: David Wichers and Chris Holt listed as founding members; David's bio notes he "secured its official acceptance."
- **Brand Guide Revision**: BrandGuide now states OASIS is "an officially accepted OWASP project" and permits co-branding with the OWASP logo.

**Files Changed:**
- `src/components/Footer.tsx`: "A proposed OWASP project" → "An officially accepted OWASP project"
- `src/pages/Home.tsx`: Hero kicker and CTA updated; "Formal OWASP approval may take months" → "Get started now."
- `src/pages/About.tsx`: Origin story, team bios updated to reflect official acceptance
- `src/pages/BrandGuide.tsx`: All hedging language removed; brand rules now permit OWASP co-branding
- `src/components/RegisterForm.tsx`: Registration note simplified

---

### [2026.07.003](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.07.003) — 2026-07-17

**Features:**
- **Testimonial Quote**: Added Aaron Birnbaum (Seron Security) testimonial quote on home page celebrating official OWASP acceptance.

**Files Changed:**
- `src/pages/Home.tsx`: Added Aaron Birnbaum quote to testimonial carousel

---

### [2026.07.002](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.07.002) — 2026-07-09

**Fixes:**
- **CSRF Token Validation**: Added CSRF token validation to bug report form to prevent cross-site request forgery attacks.

**Files Changed:**
- `src/pages/Feedback.tsx` or relevant feedback handler: CSRF validation added

---

### [2026.07.001](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.07.001) — 2026-07-01

**Fixes:**
- **UI Bugfixing**: Various UI refinements and small bug fixes across the leaderboards and PR panel.

**Files Changed:**
- Various component files with minor styling and interaction fixes

---

### [2026.06.016](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.016) — 2026-06-24

**Features:**
- **Skeleton Loader**: Added loading placeholders for better perceived performance while leaderboard data loads.
- **Vote Sync**: Improved synchronization of user votes across the UI in real-time.
- **PR Status Indicators**: Enhanced visual indicators for PR status (Accepted, Trusted, Needs Review, Withdrawn, Rejected).

**Files Changed:**
- `src/components/LeaderboardSkeleton.tsx` (new or enhanced)
- `src/pages/leaderboards/PRsTab.tsx`: Vote sync and status indicator logic

---

### [2026.06.015](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.015) — 2026-06-15

**Features:**
- **Per-Repo Sync Timestamps**: Changed from a global `synced_at` to per-repository timestamps for more accurate PR filtering and sync status reporting.

**Files Changed:**
- `schema.sql`: Updated to track `synced_at` per repository
- `worker/sync.ts`: Updated sync logic to record per-repo timestamps
- `src/pages/Leaderboards.tsx`: Display per-repo sync status

---

### [2026.06.014](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.014) — 2026-06-15

**Features:**
- **Word-Wrap Toggle for Diffs**: Added user preference to toggle word-wrap in diff viewer.
- **Persistent Diff Preferences**: User's word-wrap and diff display preferences are persisted in localStorage across sessions.

**Files Changed:**
- `src/components/PRPanel/ChangesTab.tsx`: Word-wrap toggle and persistence logic

---

### [2026.06.013](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.013) — 2026-06-09

**Features:**
- **Duplicate Vote Option**: Added "duplicate" as a fourth voting option alongside Accept, Modify, and Reject for marking PR duplicates.

**Files Changed:**
- `src/components/VoteForm.tsx`: Added "duplicate" decision option
- `worker/handlers/vote.ts`: Vote handler supports duplicate decision
- `schema.sql`: Updated to support duplicate vote tracking

---

### [2026.06.012](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.012) — 2026-06-09

**Fixes:**
- **Leaderboard Repo Text Alignment**: Fixed alignment of repository names on leaderboard cards to start (left-align) instead of center.

**Files Changed:**
- `src/pages/leaderboards/ProjectsTab.tsx` or CSS: Flexbox alignment fix

---

### [2026.06.011](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.011) — 2026-06-09

**Features:**
- **Error UI and Retry Logic**: Enhanced error handling on leaderboard tabs with user-friendly error messages and retry buttons.

**Files Changed:**
- `src/pages/Leaderboards.tsx`: Error state handling
- `src/pages/leaderboards/*.tsx`: Error UI and retry callbacks

---

### [2026.06.010](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.010) — 2026-06-09

**Features:**
- **Duplicate Feature Summary and Avatar UI**: Enhanced UI for duplicate detection with user avatars and summary cards showing which PR a duplicate links to.

**Files Changed:**
- `src/components/PRPanel/SummaryTab.tsx`: Duplicate PR reference card
- `src/components/DuplicateCard.tsx` (new or enhanced)

---

### [2026.06.009](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.009) — 2026-06-09

**Features:**
- **Duplicate PR Detection & Auto-Close Flow**: Implemented automatic detection of duplicate PRs within the OASIS pipeline, with automatic close and linking to the canonical root PR.

**Files Changed:**
- `worker/handlers/vote.ts`: Duplicate detection and auto-close logic
- `schema.sql`: Added `duplicate_of` and `closed_as_duplicate` columns to `pull_requests`
- `worker/sync.ts`: Duplicate detection during sync

---

### [2026.06.008](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.008) — 2026-06-05

**Fixes:**
- **GitHub Login Fixed**: Resolved OAuth configuration issues with Cloudflare Workers, D1 database, and KV storage setup.

**Files Changed:**
- `wrangler.toml`: Configured D1 database binding and KV namespace
- `worker/index.ts`: Updated database and KV client initialization

---

### [2026.06.007](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.007) — 2026-06-05

**Features:**
- **Externalize OAuth Callback**: Moved OAuth configuration to environment-based URLs for better multi-environment support (dev, staging, prod).
- **Production Config**: Added production OAuth callback URL configuration.

**Files Changed:**
- `worker/handlers/auth.ts`: Environment-based callback URL
- `wrangler.toml`: Added prod configuration environment

---

### [2026.06.006](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.006) — 2026-06-05

**Features:**
- **Full-Sync Endpoint**: Added `GET /api/admin/full-sync` endpoint for manual full synchronization of all repos and PRs from GitHub.
- **Reactions UNIQUE Constraint**: Added database constraint to prevent duplicate reaction records.

**Files Changed:**
- `worker/index.ts`: Added full-sync endpoint
- `schema.sql`: Added UNIQUE constraint to `comment_reactions` table

---

### [2026.06.005](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.005) — 2026-06-05

**Fixes:**
- **OAuth State Cookie SameSite**: Tightened security by setting OAuth state cookie SameSite to Lax to prevent CSRF in OAuth flow.

**Files Changed:**
- `worker/handlers/auth.ts`: Set SameSite=Lax on `__oauth_state` cookie

---

### [2026.06.004](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.004) — 2026-06-05

**Features:**
- **Remove Tools Leaderboard Temporarily**: Disabled the Tools leaderboard tab pending redesign and improved data structure.

**Files Changed:**
- `src/pages/Leaderboards.tsx`: Commented out Tools tab from navigation

---

### [2026.06.003](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.003) — 2026-06-04

**Fixes:**
- **Security Update**: General security patch.

**Files Changed:**
- (Security details may be withheld; refer to commit for specifics)

---

### [2026.06.002](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.002) — 2026-06-04

**Features:**
- **Brand Guide Page**: Added comprehensive brand guidelines page with OASIS logo usage, color palette, typography, UI patterns, and brand voice rules.

**Files Changed:**
- `src/pages/BrandGuide.tsx` (new)
- `src/pages/BrandGuide.css` (new)

---

### [2026.06.001](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.06.001) — 2026-06-03

**Features:**
- **Validator Application UI Refinement**: Replaced free-text "next_step" field with structured radio button options and an "Other" free-text field in the validator application form.

**Files Changed:**
- `src/components/RegisterForm.tsx` or application form: Updated form field UI

---

### [2026.05.040](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.040) — 2026-05-30

**Features:**
- **Tools Leaderboard UI Refinement**: Moved role descriptions from a tab note into individual tool section headings for better clarity and organization.

**Files Changed:**
- `src/pages/leaderboards/ToolsTab.tsx`: Updated section headers with role descriptions

---

### [2026.05.039](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.039) — 2026-05-30

**Fixes:**
- **Validator Bots in Sync**: Fixed sync logic to properly include automated validator bots in contributor tracking.
- **Always Show Validate Section**: Ensured Validate section always displays in Tools leaderboard even if validator list is empty.

**Files Changed:**
- `worker/sync.ts`: Updated bot filtering logic
- `src/pages/leaderboards/ToolsTab.tsx`: Conditional rendering of Validate section

---

### [2026.05.038](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.038) — 2026-05-30

**Features:**
- **Tools Leaderboard Restructure**: Split Tools leaderboard into three organized sections: Detect (tools that found vulns), Fix (bot PR authors), Validate (human validators + validator bots).

**Files Changed:**
- `src/pages/leaderboards/ToolsTab.tsx`: Major restructuring with three sections

---

### [2026.05.037](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.037) — 2026-05-30

**Fixes:**
- **Sticky Tab Bar Preview Banner Clear**: Fixed z-index and positioning so the sticky tab bar properly clears the top preview banner when scrolling.

**Files Changed:**
- `src/pages/Leaderboards.css`: Adjusted z-index and top positioning

---

### [2026.05.036](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.036) — 2026-05-30

**Features:**
- **Contributor Panel & Reputation Schema**: Added detailed contributor panel with reputation scoring logic, including base reputation, modified reputation, 90-day ranking, and reaction tracking.

**Files Changed:**
- `src/components/ContributorPanel/ContributorPanel.tsx` (new)
- `schema.sql`: Enhanced `contributors` table with reputation scoring columns
- `worker/sync.ts`: Implemented reputation calculation logic

---

### [2026.05.035](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.035) — 2026-05-30

**Features:**
- **Filter Pills UI Reorganization**: Moved filter pills (repo, status, etc.) to their own dedicated row below the search bar for better visual hierarchy.
- **Sync Status Inline Chip**: Changed sync status from a separate element to an inline chip within the tab bar.

**Files Changed:**
- `src/pages/Leaderboards.tsx`: Filter layout reorganization
- `src/pages/leaderboards/PRsTab.tsx`: Filter pill component updates

---

### [2026.05.034](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.034) — 2026-05-30

**Features:**
- **PR Leaderboard UI Overhaul**: Major redesign of the PR leaderboard table with consensus bar visualization, combined title/repo column, per-file diff sub-tabs, enhanced toolbar, vote row highlighting, chevron indicators, and improved navigation CTA visibility.

**Files Changed:**
- `src/pages/leaderboards/PRsTab.tsx`: Complete UI overhaul
- `src/pages/leaderboards/PRsTab.css`: Extensive styling updates
- `src/components/ConsensusBar.tsx` (new or enhanced)

---

### [2026.05.033](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.033) — 2026-05-30

**Features:**
- **Unified and Character-Level Diffs**: Added support for both unified and character-level (inline) diff view modes in the PR panel.

**Files Changed:**
- `src/components/PRPanel/ChangesTab.tsx`: Added diff rendering modes
- `src/components/DiffViewer.tsx` (new or enhanced): Unified and char-level diff rendering

---

### [2026.05.032](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.032) — 2026-05-30

**Features:**
- **Mermaid Diagram Rendering**: Added support for rendering Mermaid diagrams in PR body markdown.
- **HTML Details/Summary**: Enabled HTML `<details>` and `<summary>` elements in PR body markdown for collapsible sections.
- **Markdown in Comments**: Enhanced comment rendering to properly parse and render markdown formatting.
- **"Needs My Vote" Filter**: Added dedicated filter for PRs that the logged-in user has not yet voted on.
- **PRs as Default Tab**: Changed default leaderboard tab from Projects to PRs for logged-in users.

**Files Changed:**
- `src/components/MarkdownRenderer.tsx` (new or enhanced): Mermaid + HTML details support
- `src/pages/Leaderboards.tsx`: Default tab logic for authenticated users
- `src/pages/leaderboards/PRsTab.tsx`: "Needs My Vote" filter option

---

### [2026.05.031](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.031) — 2026-05-30

**Features:**
- **Sticky Leaderboard Tabs**: Made the leaderboard tab bar sticky (fixed) during scroll for persistent tab access without scrolling back up.
- **Dismissible Preview Banner**: Added dismiss button to the top preview banner so users can close it and gain vertical space.

**Files Changed:**
- `src/pages/Leaderboards.tsx`: Sticky tab bar + dismissible banner logic
- `src/pages/Leaderboards.css`: Sticky positioning and z-index adjustments

---

### [2026.05.030](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.030) — 2026-05-30

**Features:**
- **Full-Height PR Panel**: PR side panel now extends full height of viewport for better use of screen real estate.
- **Rounded Corners**: Enhanced visual polish with rounded corners on PR panel and various components.
- **Markdown PR Body**: PR body now renders as proper markdown instead of plain text.
- **Side-by-Side Diff**: Changed from unified diff to side-by-side diff view by default.
- **Summary First Tabs**: Moved Summary tab to the first position in PR panel tabs for better discovery.
- **Vote Fade**: Added fade/opacity effect to vote options the user hasn't selected.

**Files Changed:**
- `src/components/PRPanel/PRPanel.tsx`: Layout and tab order changes
- `src/components/PRPanel/PRPanel.css`: Full-height, rounded corners, styling
- `src/components/DiffViewer.tsx`: Side-by-side diff rendering

---

### [2026.05.029](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.029) — 2026-05-30

**Features:**
- **My Vote Column**: Added column to PR table showing the logged-in user's vote (Accept/Modify/Reject/None) with visual highlighting.
- **Agree/Disagree Row Highlight**: Rows where user's vote matches the consensus are highlighted in green; disagreements in red.

**Files Changed:**
- `src/pages/leaderboards/PRsTab.tsx`: "My Vote" column and row highlighting logic

---

### [2026.05.028](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.028) — 2026-05-30

**Features:**
- **PR Side Panel**: Introduced slide-out side panel for PR details, replacing inline expansion. Includes tabs for Summary, PR metadata, Body, Diffs, and Comments.
- **Vote Form in Panel**: Integrated voting form directly in the PR panel for easy voting without navigation.
- **Sign-In Modal**: Added modal prompt for unauthenticated users to sign in before voting on PRs.

**Files Changed:**
- `src/components/PRPanel/PRPanel.tsx` (new)
- `src/components/PRPanel/SummaryTab.tsx` (new)
- `src/components/PRPanel/PRTab.tsx` (new)
- `src/components/PRPanel/BodyTab.tsx` (new)
- `src/components/PRPanel/ChangesTab.tsx` (new)
- `src/components/PRPanel/CommentsTab.tsx` (new)
- `src/components/VoteForm.tsx` (new)
- `src/components/SignInModal.tsx` (new)
- `src/components/PRPanel/PRPanel.css` (new)

---

### [2026.05.027](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.027) — 2026-05-30

**Fixes:**
- **OAuth Set-Cookie Headers**: Fixed HTTP header handling in OAuth callback to properly set multiple Set-Cookie headers using `Headers.append()` instead of `Headers.set()`.

**Files Changed:**
- `worker/handlers/auth.ts`: OAuth callback Set-Cookie header fix

---

### [2026.05.026](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.026) — 2026-05-30

**Features:**
- **GitHub OAuth Login**: Implemented complete GitHub OAuth v2 login flow with secure state validation, token encryption, and session management.
- **Click-to-Vote on PRs**: Integrated voting directly from the PR table row without requiring panel navigation.

**Files Changed:**
- `worker/handlers/auth.ts` (new)
- `worker/security.ts` (new): OAuth state generation and CSRF validation
- `src/context/AuthContext.tsx` (new)
- `src/components/Nav.tsx`: Login/logout UI
- `worker/index.ts`: OAuth route wiring

---

### [2026.05.025](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.025) — 2026-05-30

**Features:**
- **Sticky Preview Banner**: Added fixed banner at top of page for important announcements or preview information.
- **Hamburger Nav Menu**: Implemented mobile-friendly hamburger menu for navigation on small screens.

**Files Changed:**
- `src/components/PreviewBanner.tsx` (new)
- `src/components/Nav.tsx`: Hamburger menu logic
- `src/components/Nav.css`: Mobile responsive navigation

---

### [2026.05.024](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.024) — 2026-05-30

**Docs:**
- **TypeScript Refactor Documentation**: Updated README and DEPLOY guides to reflect the extraction of the worker into TypeScript modules and Cloudflare Git integration workflow changes.

**Files Changed:**
- `README.md`: Updated build and deployment instructions
- `DEPLOY.md`: Updated worker module structure documentation

---

### [2026.05.023](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.023) — 2026-05-29

**Refactor:**
- **Worker TypeScript Modules**: Extracted monolithic `worker.js` into well-organized TypeScript modules under `worker/` directory with handlers, utilities, database, and sync logic separated for maintainability.

**Files Changed:**
- `worker/index.ts` (new): Worker entry point
- `worker/handlers/` (new): Modular request handlers
- `worker/db.ts` (new): Database utilities
- `worker/github.ts` (new): GitHub API helpers
- `worker/sync.ts` (new): Sync logic
- Old `worker.js` deleted

---

### [2026.05.022](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.022) — 2026-05-29

**Maintenance:**
- **Removed Unused GitHub Actions Workflows**: Deleted outdated CI/CD workflows no longer in use.

**Files Changed:**
- `.github/workflows/`: Deleted unused workflow files

---

### [2026.05.021](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.021) — 2026-05-29

**Fixes:**
- **PR-Level Chunking for Manual Sync**: Implemented pagination for manual sync operations to process 10 PRs at a time, preventing timeout on large syncs.

**Files Changed:**
- `worker/sync.ts`: PR-level chunking logic for manual `/leaderboard-refresh`

---

### [2026.05.020](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.020) — 2026-05-29

**Features:**
- **Cursor-Based Chunked Sync**: Implemented efficient cursor-based pagination for GitHub API sync to handle large repositories without hitting rate limits or timeouts.

**Files Changed:**
- `worker/sync.ts`: Cursor-based sync pagination logic

---

### [2026.05.019](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.019) — 2026-05-29

**Fixes:**
- **Skip Reactions Fetch on Manual Sync**: Optimized manual sync to skip comment reactions fetch to stay within Cloudflare Worker subrequest limits (50 per request).

**Files Changed:**
- `worker/sync.ts`: Conditional reactions fetching

---

### [2026.05.018](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.018) — 2026-05-29

**Fixes:**
- **Async Handler Error Catching**: Fixed promise rejection handling by properly awaiting all async handlers inside try/catch blocks.

**Files Changed:**
- `worker/index.ts`: Async/await error handling

---

### [2026.05.017](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.017) — 2026-05-29

**Fixes:**
- **Preview Config Promotion**: Moved preview configuration to top-level in `wrangler.toml` for better clarity and consistency.

**Files Changed:**
- `wrangler.toml`: Config restructuring

---

### [2026.05.016](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.016) — 2026-05-29

**Maintenance:**
- **Wrangler Configuration Update**: Updated `wrangler.toml` with latest Cloudflare Workers best practices.

**Files Changed:**
- `wrangler.toml`: Configuration updates

---

### [2026.05.015](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.015) — 2026-05-27

**Maintenance:**
- **Preview Deployment Workflow Update**: Refined GitHub Actions preview deployment workflow for better handling of staging deployments.

**Files Changed:**
- `.github/workflows/deploy_preview.yml`: Workflow refinement

---

### [2026.05.014](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.014) — 2026-05-27

**Maintenance:**
- **Wrangler Configuration Update**: Updated `wrangler.toml` with deployment configuration improvements.

**Files Changed:**
- `wrangler.toml`: Configuration updates

---

### [2026.05.013](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.013) — 2026-05-27

**Maintenance:**
- **Preview Deployment Workflow Update**: Refined GitHub Actions workflow for consistent staging environment deployment.

**Files Changed:**
- `.github/workflows/deploy_preview.yml`: Workflow improvement

---

### [2026.05.012](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.012) — 2026-05-26

**Refactor:**
- **Support Page Split**: Extracted Support page from Sponsors page into its own dedicated page for better content organization and focus.

**Files Changed:**
- `src/pages/Support.tsx` (new)
- `src/pages/Sponsors.tsx`: Removed support content
- `src/App.tsx`: Added support route

---

### [2026.05.011](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.011) — 2026-05-26

**Features:**
- **Preview Banner**: Added dismissible announcement banner at the top of every page.
- **Feedback Form**: Integrated feedback form allowing users to submit suggestions and bug reports.
- **Support Page**: Dedicated page with community engagement strategies and outreach resources.
- **Principles Statements**: Added principles section across Overview and other pages to explain OASIS values.
- **Database Fix**: SQL schema correction for proper constraints and relationships.

**Files Changed:**
- `src/components/PreviewBanner.tsx` (new)
- `src/components/FeedbackForm.tsx` (new)
- `src/pages/Support.tsx` (new)
- `src/pages/Overview.tsx`: Added principles section
- `schema.sql`: Schema improvements

---

### [2026.05.010](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.010) — 2026-05-26

**Maintenance:**
- **Preview Deployment Workflow Update**: GitHub Actions workflow refinement for consistent preview environment handling.

**Files Changed:**
- `.github/workflows/deploy_preview.yml`: Workflow updates

---

### [2026.05.009](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.009) — 2026-05-26

**Maintenance:**
- **Preview Deployment Workflow Update**: Initial creation of GitHub Actions workflow for automated preview deployments.

**Files Changed:**
- `.github/workflows/deploy_preview.yml` (new)

---

### [2026.05.008](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.008) — 2026-05-26

**Maintenance:**
- **Preview Deployment Workflow Initial Creation**: Set up GitHub Actions workflow for staging environment deployments.

**Files Changed:**
- `.github/workflows/deploy_preview.yml` (new)

---

### [2026.05.007](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.007) — 2026-05-21

**Features:**
- **Automated Account Filtering**: Enhanced sync logic to filter out and exclude automated bot accounts from OASIS tracking, ensuring leaderboards reflect human validators only.

**Files Changed:**
- `worker/sync.ts`: Automated account detection and filtering

---

### [2026.05.006](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.006) — 2026-05-21

**Fixes:**
- **Chris Holt GitHub Handle**: Corrected GitHub username to `humor4fun`.

**Files Changed:**
- `src/pages/About.tsx`: GitHub handle update

---

### [2026.05.005](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.005) — 2026-05-20

**Features:**
- **Non-OASIS Comment Tracking**: Enhanced database schema and sync logic to track OASIS-format comments separately from general GitHub comments, enabling better filtering of validated feedback.

**Files Changed:**
- `schema.sql`: Added `oasis_comment_count` and `non_oasis_comment_count` columns to `pull_requests`
- `worker/sync.ts`: OASIS comment detection and counting logic

---

### [2026.05.004](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.004) — 2026-05-20

**Fixes:**
- **Image File Extensions**: Corrected image file extensions from `.jpg` to `.jpeg` for consistency.

**Files Changed:**
- `public/headshots/*`: Renamed image files

---

### [2026.05.003](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.003) — 2026-05-20

**Features:**
- **Testimonial Quotes Carousel**: Added an interactive carousel component on the home page displaying rotating testimonials from community members and partners.

**Files Changed:**
- `src/components/QuotesCarousel.tsx` (new)
- `src/pages/Home.tsx`: Integrated carousel component
- `src/components/QuotesCarousel.css` (new)

---

### [2026.05.002](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.002) — 2026-05-20

**Features:**
- **Team Headshots and Sponsors Update**: Added professional headshot photographs for team members and updated the Sponsors list with new partners.

**Files Changed:**
- `public/headshots/` (new): Added image files
- `src/pages/About.tsx`: Integrated headshots into team section
- `src/pages/Sponsors.tsx`: Updated sponsor list

---

### [2026.05.001](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.05.001) — 2026-05-19

**Features:**
- **React Single-Page Application**: Major refactor from static HTML to a complete React SPA with React Router for client-side navigation. Includes pages for Home, About, Overview, Leaderboards, Sponsors, and Support.

**Files Changed:**
- `src/App.tsx` (new): Root component with routing
- `src/main.tsx` (new): React entry point
- `src/pages/` (new): All page components
- `src/components/` (new): Reusable UI components
- `src/context/` (new): React context for shared state
- `package.json`: Added React, React Router, and supporting dependencies
- Removed old static HTML files

---

### [2026.04.010](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.010) — 2026-04-29

**Maintenance:**
- **Worker Configuration**: Initial worker.js configuration for Cloudflare Workers.

**Files Changed:**
- `worker.js`: Initial worker code

---

### [2026.04.009](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.009) — 2026-04-29

**Maintenance:**
- **Google Sheets Sync Script Update**: Updated the Google Sheets sync utility.

**Files Changed:**
- `google-sheets-sync.js`: Script updates

---

### [2026.04.008](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.008) — 2026-04-29

**Maintenance:**
- **GitHub Actions Workflow Update**: Updated sync-sheets workflow configuration.

**Files Changed:**
- `.github/workflows/sync-sheets.yml`: Workflow updates

---

### [2026.04.007](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.007) — 2026-04-29

**Maintenance:**
- **Google Sheets Sync Script**: Google Sheets sync utility updates.

**Files Changed:**
- `google-sheets-sync.js`: Script updates

---

### [2026.04.006](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.006) — 2026-04-29

**Maintenance:**
- **GitHub Actions Workflow Update**: Updated deploy workflow configuration.

**Files Changed:**
- `.github/workflows/sync-sheets.yml`: Workflow updates

---

### [2026.04.005](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.005) — 2026-04-29

**Maintenance:**
- **GitHub Actions Workflow Update**: Initial GitHub Actions workflow setup for sync.

**Files Changed:**
- `.github/workflows/sync-sheets.yml`: Initial workflow

---

### [2026.04.004](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.004) — 2026-04-29

**Features:**
- **Spreadsheet Data Sync**: Implemented syncing of participant data from Google Sheets.

**Files Changed:**
- `sync-sheets.js`: Spreadsheet sync implementation

---

### [2026.04.003](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.003) — 2026-04-29

**Maintenance:**
- **Initial Project Setup** (duplicate): Configuration and infrastructure setup.

**Files Changed:**
- Various configuration files

---

### [2026.04.002](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.002) — 2026-04-29

**Features:**
- **Initial OASIS Site with CI/CD**: Initial release of the OASIS website with GitHub Actions CI/CD pipeline, basic site structure, and deployment automation.

**Files Changed:**
- Initial project scaffold
- `.github/workflows/` (new): CI/CD workflows

---

### [2026.04.001](https://github.com/owasp-oasis/owasp-oasis-app/releases/tag/v2026.04.001) — 2026-04-29

**Initial Release**
- **Initial Commit**: Project initialization with foundational structure and configuration files.

**Files Changed:**
- Initial commit with README, gitignore, license, and configuration files.
