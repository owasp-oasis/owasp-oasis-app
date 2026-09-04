# OWASP OASIS — Site

Two live environments:
- **Production**: https://www.owasp-oasis.org / https://www.owasp-oasis.com
- **Preview (staging)**: https://preview.owasp-oasis.org

**Stack**: React 19 SPA + Cloudflare Worker (TypeScript) + Cloudflare D1 (SQLite) + Cloudflare KV

---

## Branch strategy

```
main      ← production  — auto-deploys to www.owasp-oasis.org on push
preview   ← staging     — auto-deploys to preview.owasp-oasis.org on push
```

Deployment is handled by **Cloudflare Git integration**. GitHub Actions validates pushes and pull requests but has no Cloudflare credentials and never deploys.

### Required development workflow

All new work starts from the latest `main` on a short-lived, purpose-named branch. Use `feat/new-feature-name` for a feature; use the equivalent `fix/`, `chore/`, or `docs/` prefix when that more accurately describes the change.

```bash
git switch main
git pull --ff-only
git switch -c feat/new-feature-name
```

Keep commits atomic and independently reversible. Commit messages must explain the reason for the change, resulting behavior, verification performed, and rollback scope. Before requesting review, run the complete local check unless the PR documents why a check cannot run:

```bash
npm run check
```

Choose one promotion path based on the validation the change requires:

#### Local validation is sufficient

```text
main → feat/new-feature-name → pull request → main
```

1. Develop and test on `feat/new-feature-name`.
2. Push the feature branch and open a PR from `feat/new-feature-name` into `main`.
3. Merge only after local checks, required GitHub checks, and review pass.
4. The merge to `main` triggers the production deployment through Cloudflare Git integration.

#### Remote preview validation is required

```text
main → feat/new-feature-name → pull request → preview → pull request → main
```

1. Develop and test locally on `feat/new-feature-name`.
2. Open a PR from `feat/new-feature-name` into `preview`.
3. Merge after review; Cloudflare deploys the resulting `preview` branch to `preview.owasp-oasis.org`.
4. Complete remote testing against the preview deployment. Apply fixes on the feature branch and merge them through follow-up `feat/new-feature-name` → `preview` PRs; ensure the final preview build passes.
5. Open a PR from `preview` into `main`, documenting the remote evidence and rollback plan.
6. Merge the `preview` → `main` PR only after remote validation and required checks pass.
7. Reconcile `preview` back to the resulting `main` tip after promotion so both long-lived branches start the next feature from the same commit.

Do not develop directly on `preview`, push directly to either long-lived branch, or mix unrelated features into a preview promotion. If `main` changes while preview validation is underway, bring the updated `main` into the feature/preview candidate through a reviewed PR and repeat the affected remote checks before promotion.

---

## Local development

### First-time setup

```bash
npm install
wrangler login

# Create a local secrets file (ask a team lead for values)
cp .dev.vars.example .dev.vars
```

The `.dev.vars` file holds local copies of secrets (never committed). You need at minimum:

```
GITHUB_TOKEN=ghp_...
ADMIN_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
ENVIRONMENT=development
```

`GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are needed to test the GitHub OAuth sign-in flow locally. Create a GitHub OAuth App at https://github.com/settings/developers and set the callback URL to `http://localhost:8787/api/auth/callback`.

### Run the dev server

```bash
npm run dev
```

Opens `http://localhost:8787`. The worker and React SPA both run locally via Miniflare (Cloudflare's local runtime). The D1 database runs as a local SQLite file — it will not have production data.

### Build commands

| Command | What it does |
|---|---|
| `npm run build:worker` | Compiles `worker/` TypeScript → `dist-worker/` |
| `npm run build:frontend` | Bundles React SPA → `dist/` via Vite |
| `npm run build` | Runs both of the above (full build) |
| `npm run check` | Runs the complete test suite and production build |
| `npm run deploy:preview` | Applies pending D1 migrations, then deploys the preview Worker |
| `npm run deploy` | Applies pending D1 migrations, then deploys the production Worker |

---

## File structure

```
worker/                    ← Cloudflare Worker (TypeScript source)
  index.ts                 ← Router — entry point, fetch + scheduled exports
  types.ts                 ← Env interface and shared type aliases
  security.ts              ← Security headers, CORS, CSRF, rate limiting, response helpers
  validation.ts            ← Input validators (email, GitHub handle, role) and body parser
  db.ts                    ← D1 database helpers (upsert, getSyncState, rebuildContributors)
  github.ts                ← GitHub API client, comment/PR body parsers, bot detection
  sync.ts                  ← GitHub sync engine (cron full sync + chunked manual sync)
  hubspot.ts               ← Durable registration and application contact sync
  handlers/
    leaderboard.ts         ← /api/leaderboard/* endpoint handlers
    register.ts            ← POST /api/register
    apply.ts               ← POST /api/apply
    feedback.ts            ← POST /api/feedback — creates GitHub issue from preview banner form
    auth.ts                ← GitHub OAuth: login, callback, me, logout; session management
    vote.ts                ← POST /api/vote, GET /api/votes/mine
    prPanel.ts             ← /api/pr-panel/:id/* — GitHub API proxy for the PR side panel

src/                       ← React SPA (frontend)
  context/
    AuthContext.tsx         ← React context — GitHub auth state (user, loading, logout, refetch)
  pages/
    Home.tsx               ← Landing page
    Leaderboards.tsx       ← Workspace shell (Pull Requests, Contributors, Maintainers, Projects)
    About.tsx              ← Team and project background
    Overview.tsx           ← How OASIS works
    Support.tsx            ← How to help: share, recruit, validate, sponsor
    Sponsors.tsx           ← Sponsors page
    leaderboards/          ← One file per leaderboard tab
      PRsTab.tsx           ← PR table with My Vote column, Needs My Vote filter
      ContributorsTab.tsx
      MaintainersTab.tsx
      ProjectsTab.tsx
      ToolsTab.tsx
  components/
    Nav.tsx                ← Navigation bar (shows GitHub avatar when signed in)
    Footer.tsx
    PreviewBanner.tsx      ← Dismissible staging banner with feedback link
    RegisterForm.tsx       ← Validator/sponsor registration form
    SortableTable.tsx      ← Generic sortable table
    ColHeader.tsx          ← Sortable column header
    QuotesCarousel.tsx     ← Auto-advancing testimonial carousel (Home page)
    PRPanel/               ← Slide-out PR side panel
      PRPanel.tsx          ← Panel shell, tab bar, open/close logic
      SummaryTab.tsx       ← CWE, CVE, CVSS, TL;DR, consensus, detection tool
      BodyTab.tsx          ← PR description rendered as GFM markdown (Mermaid, details/summary)
      ChangesTab.tsx       ← Per-file diff (side-by-side and unified modes)
      CommentsTab.tsx      ← GitHub comments with reactions and OASIS decision badges
      PRTab.tsx            ← Link to open PR on GitHub
      renderMarkdown.tsx   ← Markdown renderer (remark + rehype + remark-gfm + mermaid)
    VoteForm.tsx           ← Accept/Modify/Reject vote form (posts to /api/vote)
    VoteModal.tsx          ← Sign-in prompt modal for unauthenticated users

schema.sql                 ← D1 database schema (apply once on fresh DB)
migrations/                ← Ordered D1 migrations applied before deployment
wrangler.toml              ← Cloudflare Worker config (routes, bindings, cron)
tsconfig.worker.json       ← TypeScript config for the worker (targets @cloudflare/workers-types)
tsconfig.app.json          ← TypeScript config for the React frontend
vite.config.ts             ← Vite bundler config
export-db.js               ← Utility: export D1 registrations to CSV
.dev.vars                  ← Local secrets — git-ignored, never commit
```

### How the build pipeline works

Running `npm run build` does three things in sequence:

1. **`tsc -b`** — type-checks the frontend and node configs (no output, errors only)
2. **`tsc -p tsconfig.worker.json`** — compiles `worker/*.ts` + `worker/handlers/*.ts` into `dist-worker/*.js`
3. **`vite build`** — bundles the React SPA into `dist/`

Wrangler then deploys `dist-worker/index.js` as the Worker and `dist/` as the static assets.

---

## Worker module overview

The worker handles all server-side logic. Here is what each module is responsible for:

| Module | Responsibility |
|---|---|
| `index.ts` | Route dispatch — maps `GET`/`POST` paths to handlers; handles redirects, CORS, error boundary; exports `fetch` and `scheduled` |
| `security.ts` | Content Security Policy, security response headers, CORS preflight, CSRF token generation and validation, rate limiting (KV-backed), `jsonOk`/`jsonErr` response helpers |
| `validation.ts` | Sanitizes and validates all user input: email (RFC 5322 + blocklist), GitHub username, name, role, request body size and JSON parsing |
| `db.ts` | All D1 read/write operations: upsert repos, PRs, participants, contributors; sync state key/value store; `rebuildContributors` aggregation |
| `github.ts` | GitHub REST API client (`ghFetch`, `ghFetchAll` with pagination); parses OASIS decision comments (`accept`/`modify`/`reject`); detects SAST tool from PR body; filters automated/bot accounts |
| `sync.ts` | `runSync` — full sync for cron (1000 subrequest limit, fetches reactions); `runSyncOneRepo` — cursor-based chunked sync for manual trigger (10 PRs per call, 50 subrequest limit); shared `processPR` function used by both |
| `hubspot.ts` | Queues registration and application contact data in D1, then syncs it to HubSpot with retries and privacy-safe logging |
| `handlers/leaderboard.ts` | Six read-only API endpoints: `/api/leaderboard/meta`, `/repos`, `/prs`, `/contributors`, `/maintainers`, `/tools` |
| `handlers/register.ts` | `POST /api/register` — validates and atomically queues registration contact data for HubSpot |
| `handlers/apply.ts` | `POST /api/apply` — stores role applications and queues contact fields for HubSpot while keeping narrative text in D1 |
| `handlers/feedback.ts` | `POST /api/feedback` — creates a GitHub issue in this repo via the API |
| `handlers/auth.ts` | GitHub OAuth flow: `GET /api/auth/login`, `GET /api/auth/callback`, `GET /api/auth/me`, `POST /api/auth/logout` — session management via D1 `user_sessions` table |
| `handlers/vote.ts` | `POST /api/vote` — submit an OASIS validation vote (accept/modify/reject) as a GitHub comment; `GET /api/votes/mine` — return all votes cast by the current user |
| `handlers/prPanel.ts` | PR Panel proxy: `GET /api/pr-panel/:id/details`, `/files`, `/comments`; `POST /api/pr-panel/:id/react` — proxies GitHub API using the server-side token; reactions use the user's own OAuth token |

---

## Frontend pages

| Page | Route | Description |
|---|---|---|
| Home | `/` | Landing page with hero, feature overview, registration form, and quotes carousel |
| Workspace | `/workspace/pull-requests` | Task-focused work area with directly linkable Pull Requests, Projects, Contributors, and Maintainers tables; `/workspace` redirects here |
| About | `/about` | Team, project background, and OWASP affiliation |
| Overview | `/overview` | How OASIS works — full process walkthrough |
| Support | `/support` | How to help: share social messages, targeted conversations, become a validator, sponsor the project |
| Sponsors | `/sponsors` | Current sponsors and sponsor interest form |

---

## Frontend components

| Component | Description |
|---|---|
| `Nav` | Top navigation bar with links to all pages; shows logged-in GitHub avatar and logout when authenticated |
| `Footer` | Site-wide footer |
| `PreviewBanner` | Dismissible banner shown on the preview environment indicating the site is in staging; includes a link to submit feedback |
| `RegisterForm` | Validator/sponsor registration form — posts to `POST /api/register` |
| `SortableTable` / `ColHeader` | Generic sortable data table used by all leaderboard tabs. Accepts an optional `toolbarRight?: ReactNode` rendered flush-right in the search toolbar (used by `PRsTab` for filter pills). `emptyMessage` accepts `ReactNode` so empty states can include interactive elements. |
| `QuotesCarousel` | Auto-advancing animated carousel for testimonial/quote content on the Home page |
| `PRPanel` | Slide-out side panel shown when a PR row is clicked in the leaderboard; contains five tabs: **Summary** (CWE, CVE, CVSS, TL;DR, consensus), **Body** (full PR description rendered as markdown with Mermaid support), **Diffs** (per-file sub-tab bar with side-by-side or unified diff and intra-line character highlighting; diff view dropdown is internal to this tab), **Comments** (GitHub issue comments with reactions and OASIS decision badges), and **PR** (link to open on GitHub) |
| `VoteForm` | Form inside the PR Panel for submitting an accept/modify/reject vote; builds the OASIS validation comment template and posts to `POST /api/vote` |
| `VoteModal` | Modal wrapper that prompts unauthenticated users to sign in with GitHub before voting |

---

## Authentication

GitHub OAuth is used for features that write to GitHub (voting, reactions). No account is required to browse the site or Workspace.

### Flow

```
User clicks "Sign in with GitHub"
  → GET /api/auth/login
      sets __oauth_state cookie
      redirects to github.com/login/oauth/authorize
  → GitHub redirects to GET /api/auth/callback?code=...&state=...
      validates state (timing-safe)
      exchanges code for access token
      fetches GitHub user info (login, avatar_url)
      creates session row in D1 user_sessions (30-day TTL)
      sets HttpOnly session cookie
      redirects to /workspace/pull-requests
  → GET /api/auth/me  (called on every page load)
      returns { user: { login, avatar_url } } or { user: null }
  → POST /api/auth/logout  (requires CSRF token)
      deletes D1 session row
      clears session cookie
```

### Required secrets for auth

| Secret | Purpose |
|---|---|
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret |

The OAuth callback URL registered in the GitHub app must be `https://preview.owasp-oasis.org/api/auth/callback`.

### D1 tables

- **`user_sessions`** — one row per active session; stores `session_id` (64-char hex, used as cookie value), `github_login`, `avatar_url`, `github_token` (user's OAuth token, never sent to browser), `expires_at` (30 days)
- **`user_votes`** — one row per `(github_login, pr_id)` pair; records the user's decision and the resulting GitHub comment ID

---

## Voting system

Validators can submit their OASIS validation decision directly from the leaderboard PR panel.

### How it works

1. User clicks a PR row in the leaderboards → PR Panel slides open
2. User clicks the "Vote" tab (sign-in modal shown if not authenticated)
3. User selects **Accept**, **Modify**, or **Reject** and fills in the structured form
4. `POST /api/vote` validates CSRF, session, rate limit, and body; then:
   - Posts a formatted OASIS comment to GitHub using the user's OAuth token (comment appears as them)
   - Upserts `pr_participants` for the PR
   - Increments `consensus_accept/modify/reject` and `participants` on `pull_requests`
   - Upserts the `contributors` row for the user
   - Inserts a `user_votes` record
5. The PR table shows a **My Vote** column reflecting the decision, with row highlight (green = agree with majority, red = disagree)

### Vote constraints

- One vote per user per PR (enforced in both D1 and the UI)
- Voting only permitted on open PRs
- Reject votes require a `summary` (reason); Accept/Modify require `confidence` (Low/Medium/High) and a `summary`
- All text fields capped at 2000 characters

### Comment format

Accept/Modify votes post:
```
Validation summary:

|  |  |
| :-- | :-- |
| Decision | Accept |
| Confidence | High |
| Summary | ... |
| Next step | ... |
```

Reject votes post:
```
Rejection summary:

|  |  |
| :-- | :-- |
| Decision | Reject |
| Reason | ... |
| Blocking issues | ... |
| To reconsider | ... |
```

---

## Workspace pull-request table

The **Pull Requests** table in the Workspace is the primary work queue for validators and is directly linkable at `/workspace/pull-requests`.

### Columns

| Column | Notes |
|---|---|
| Pull Request | Combined column: muted repo-name link (top) + PR number and full title below. Title truncated by CSS ellipsis — no JS slice. |
| Status | OASIS status badge (`Needs Review`, `Trusted`, `Rejected`, `Accepted`). Header is an interactive `ⓘ` popover listing all status definitions and the Trusted criteria thresholds. |
| My Vote | Shown only when logged in. Displays the user's vote with coloured badge. Row gets a coloured left-border inset shadow: green = Accept, amber = Modify, red = Reject. Also shows `pr-row-agree` (green tint) or `pr-row-disagree` (amber tint) bg overlay when the user's vote matches/diverges from the crowd plurality. |
| Consensus | Compact stacked bar (Accept/Modify/Reject proportions) + total vote count. Tooltip shows breakdown including OASIS vs non-OASIS comment counts. |
| Participants | Total unique participants. |
| Last updated | Formatted date. |
| ›  | Hover-only chevron signalling the row is clickable. |

### Filter pills

"Quick filters:" pills sit below the search input in the shared toolbar. When logged in, a **Needs My Vote** pill appears showing the count of unreviewed open PRs. Selecting it when there are none shows: _"You've reviewed all open PRs — great work!"_ with a "View all PRs" inline button.

The **Project** dropdown filters the queue to a repository. Its selection is stored in the `repo` query parameter, so the filtered Workspace URL can be copied and shared directly.

### Status thresholds (stub)

`Trusted` requires ≥10 participants and ≥75% Accept votes among open PRs. These thresholds are explicitly marked as stubs in the UI and TODO list — they will be ratified by the OASIS community.

---

## PR Panel

The PR Panel is a slide-out side panel that loads live GitHub data for any PR in the Workspace.

### API endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/pr-panel/:id/details` | GET | PR metadata: title, state, author, CWE/CVE/CVSS parsed from title and body, TL;DR, detection tool, additions/deletions |
| `/api/pr-panel/:id/files` | GET | Changed files list with unified patch hunks |
| `/api/pr-panel/:id/comments` | GET | All GitHub issue comments with reactions and OASIS decision parsing |
| `/api/pr-panel/:id/react` | POST | Add a GitHub reaction to a comment using the user's OAuth token (requires auth) |

All endpoints look up `repo_name` and PR `number` from D1 by the internal `id`, then proxy the relevant GitHub REST API endpoint using the server-side `GITHUB_TOKEN`. The `react` endpoint uses the user's session token so reactions appear as the authenticated user.

### Frontend tabs

| Tab | Content |
|---|---|
| Summary | CWE ID and description, CVE/CAPEC/CVSS, severity, TL;DR, detection tool, consensus vote counts, participant count |
| Body | Full PR description rendered as GitHub-flavoured markdown, including Mermaid diagrams and `<details>`/`<summary>` HTML |
| Diffs | Per-file sub-tab bar (last 2 path segments as tab label, full path in tooltip, `+add −del` churn inline). Diff view dropdown (Split / Split+char / Unified / Unified+char) lives inside this tab. Column widths set via `<colgroup>` for correct sizing. |
| Comments | GitHub issue comments with author avatar, OASIS decision badge (Accept/Modify/Reject), emoji reactions |
| PR | Direct link to open the PR on GitHub |

---

## Feedback

`POST /api/feedback` creates a GitHub issue in the `owasp-oasis/owasp-oasis-app` repository tagged `preview-feedback`. The form is accessible from the PreviewBanner.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | Yes | 10–5000 characters |
| `severity` | string | No | `bug`, `suggestion`, or `other` (default) |
| `contact` | string | No | Max 200 characters; included in the issue body |

---

## Admin endpoint

`GET /api/admin/registrations` returns all registration rows (id, name, email, github, role, created_at). Protected by the `ADMIN_SECRET` environment variable — pass it in the `X-Admin-Secret` header.

```bash
curl https://preview.owasp-oasis.org/api/admin/registrations \
  -H "X-Admin-Secret: <your-secret>"
```

---

## Database

The D1 database (`oasis-db`) is shared between the preview and production workers. All commands that operate on the remote DB need `--remote`.

```bash
# Query registrations
wrangler d1 execute oasis-db --remote \
  --command="SELECT * FROM registrations ORDER BY created_at DESC"

# Count registrations
wrangler d1 execute oasis-db --remote \
  --command="SELECT COUNT(*) as total FROM registrations"

# Apply schema to a fresh database
wrangler d1 execute oasis-db --remote --file=schema.sql

# Check leaderboard sync state
wrangler d1 execute oasis-db --remote \
  --command="SELECT * FROM sync_state"
```

If your CLI is logged into a different Cloudflare account, prefix commands with:
```bash
CLOUDFLARE_ACCOUNT_ID=<your-account-id> wrangler d1 execute ...
```

The account ID is in the Cloudflare dashboard under **Account Home → Overview** (right sidebar).

---

## Secrets

Secrets are set per-worker and are not shared between preview and production. HubSpot synchronization is enabled only where `HUBSPOT_TOKEN` is configured. The daily analytics archive is enabled only in production when both Cloudflare analytics secrets are configured.

```bash
# Set secrets on the preview worker
wrangler secret put GITHUB_TOKEN        --name owasp-oasis-app-preview
wrangler secret put ADMIN_SECRET        --name owasp-oasis-app-preview
wrangler secret put GITHUB_CLIENT_ID    --name owasp-oasis-app-preview
wrangler secret put GITHUB_CLIENT_SECRET --name owasp-oasis-app-preview
wrangler secret put HUBSPOT_TOKEN         --name owasp-oasis-app-preview

# List secrets on the preview worker
wrangler secret list --name owasp-oasis-app-preview
```

### Required secrets

| Secret | Purpose |
|---|---|
| `GITHUB_TOKEN` | Service account PAT — used by sync engine and PR panel proxy. Needs `public_repo` scope. Must belong to a member of the `owasp-oasis` GitHub org. |
| `ADMIN_SECRET` | Shared secret for `GET /api/admin/registrations`. Send via `X-Admin-Secret` header. |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID — used for validator sign-in. |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret — used to exchange OAuth codes for access tokens. |
| `HUBSPOT_TOKEN` | HubSpot private-app token. Requires only `crm.objects.contacts.read` and `crm.objects.contacts.write`. |
| `CLOUDFLARE_ANALYTICS_TOKEN` | Cloudflare API token used only by the production daily archive. Scope it to the OASIS zone with Analytics Read permission. |

The non-secret `CLOUDFLARE_ZONE_ID` is committed under `[env.production.vars]` in `wrangler.toml` so Git-based deployments preserve it. Set only the production Analytics API token interactively:

```bash
npx wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN --env production
```

The collector runs daily at 03:45 UTC, archives at most five closed days per run, and seeds a 30-day backfill. An administrator can inspect or retry it from `/workspace/status` and can inspect the resulting aggregates at `/admin/analytics`. Preview telemetry intentionally no-ops because preview shares the production D1 database.

`HUBSPOT_PROPERTY_MAP` is a non-secret JSON environment variable that maps OASIS fields to existing HubSpot custom-property internal names. Supported keys are `github`, `role`, `source`, `organization`, and `submitted_at`; omitted fields are not sent. For example: `{"github":"oasis_github","role":"oasis_role","source":"oasis_source"}`.

The `GITHUB_TOKEN` must have `public_repo` scope and belong to a member of the `owasp-oasis` GitHub org.

---

## Manual deploy

Cloudflare auto-deploys on push, but if you need to deploy manually, build first and then run the environment-specific deploy command:

```bash
# Set your Cloudflare account ID
export CLOUDFLARE_ACCOUNT_ID=<your-account-id>

# Build and deploy the preview worker
npm run build && npm run deploy:preview

# Build and deploy the production environment to owasp-oasis
npm run build && npm run deploy
```

---

## Commit convention

```
feat: add leaderboard tools tab
fix: CSRF cookie not sent on mobile Safari
chore: update wrangler to 4.x
docs: update README for TypeScript refactor
refactor: extract PR processing into shared function
style: fix table alignment on mobile
```
