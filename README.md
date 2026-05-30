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

Deployment is handled by **Cloudflare Git integration** — pushing to either branch triggers a build and deploy automatically. There are no GitHub Actions involved.

### Recommended workflow

```
preview  ←── feature/your-feature   (open PR, merge to preview to test)
   └──→ main                        (merge preview to main to go live)
```

1. Branch off `preview` for your work
2. Open a PR into `preview` — get a review
3. Merge → auto-deploys to `preview.owasp-oasis.org` for testing
4. When ready for production, open a PR from `preview` into `main`

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
ENVIRONMENT=development
```

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
  handlers/
    leaderboard.ts         ← /api/leaderboard/* endpoint handlers
    register.ts            ← POST /api/register
    feedback.ts            ← POST /api/feedback

src/                       ← React SPA (frontend)
  pages/                   ← Page-level components (Home, Leaderboards, About, etc.)
  components/              ← Shared UI components (Nav, Footer, RegisterForm, etc.)

schema.sql                 ← D1 database schema (apply once on fresh DB)
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
| `handlers/leaderboard.ts` | Six read-only API endpoints: `/api/leaderboard/meta`, `/repos`, `/prs`, `/contributors`, `/maintainers`, `/tools` |
| `handlers/register.ts` | `POST /api/register` — CSRF validation, rate limiting, input validation, duplicate check, D1 insert |
| `handlers/feedback.ts` | `POST /api/feedback` — creates a GitHub issue in this repo via the API |

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

Secrets are set per-worker. The preview and production workers each need their own copy.

```bash
# Set a secret on the preview worker
wrangler secret put GITHUB_TOKEN --name owasp-oasis-app-preview
wrangler secret put ADMIN_SECRET  --name owasp-oasis-app-preview

# List secrets on the preview worker
wrangler secret list --name owasp-oasis-app-preview
```

The `GITHUB_TOKEN` must have `public_repo` scope and belong to a member of the `owasp-oasis` GitHub org.

---

## Manual deploy

Cloudflare auto-deploys on push, but if you need to deploy manually (e.g. immediately after a config change without pushing):

```bash
# Set your Cloudflare account ID
export CLOUDFLARE_ACCOUNT_ID=<your-account-id>

# Build and deploy the preview worker
npm run deploy:preview

# Or build and deploy directly (uses wrangler.toml config)
npm run build && wrangler deploy
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
