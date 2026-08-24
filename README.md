# OWASP OASIS — Site

Live at: https://www.owasp-oasis.com + https://www.owasp-oasis.org

---

## 🚀 Quick deploy

```bash
git push origin main   # triggers Cloudflare Workers Builds
```

---

## Branch strategy

```
main         ← production (auto-deploys to live site on push)
  └── feature/your-feature-name   ← your work branch
```

**Never push directly to `main`** — always open a Pull Request.

---

## Adding a new feature (team workflow)

```bash
# 1. Pull latest main
git checkout main
git pull origin main

# 2. Create your feature branch
git checkout -b feature/your-feature-name

# 3. Make your changes to index.html, worker.js etc

# 4. Commit
git add .
git commit -m "feat: describe what you changed"

# 5. Push your branch
git push origin feature/your-feature-name

# 6. Open a Pull Request on GitHub
# → GitHub Actions will run validation automatically
# → Get a review from a teammate
# → Merge to main → Cloudflare deploys the live site ✅
```

---

## Local development

### First time setup
```bash
npm install
npx wrangler login
cp .dev.vars.example .dev.vars
# Ask team lead for secret values
```

### Run locally
```bash
npm run dev
# Opens http://localhost:8787
```

---

## File structure

| File | Purpose |
|------|---------|
| `index.html` | The website UI |
| `worker.js` | Cloudflare Worker — API + security |
| `hubspot.js` | Durable HubSpot outbox processing, contact creation, and retries |
| `wrangler.toml` | Cloudflare config |
| `schema.sql` | DB schema (fresh installs only) |
| `migrations/` | Ordered D1 production migrations applied before deployment |
| `export-db.js` | Export DB to CSV |
| `.dev.vars` | Local secrets — git-ignored |
| `.github/workflows/validate.yml` | GitHub validation only; never deploys |

---

## Database

```bash
npx wrangler d1 execute oasis-db --command="SELECT * FROM registrations ORDER BY created_at DESC" --remote
npx wrangler d1 execute oasis-db --command="SELECT COUNT(*) as total FROM registrations" --remote
node export-db.js
```

---

## Secrets

```bash
npx wrangler secret put ADMIN_SECRET
npx wrangler secret put HUBSPOT_TOKEN --name owasp-oasis
npx wrangler secret list
```

`HUBSPOT_TOKEN` must be a HubSpot private-app token with
`crm.objects.contacts.read` and `crm.objects.contacts.write` scopes.

### HubSpot contact synchronization

Registrations and applications are written to D1 together with a durable
outbox job. The request returns immediately, then the Worker attempts the job
in the background. Production retries pending jobs hourly at 15 minutes past
the hour with capped exponential backoff. The first migration also queues all
existing registrations and applications as a one-time backfill.

New contacts receive email and the submitted name. Existing contacts keep
their HubSpot-managed first and last names. OASIS metadata is retained in the
outbox and can be mapped to existing HubSpot custom contact properties through
the non-secret `HUBSPOT_PROPERTY_MAP` JSON variable:

```toml
HUBSPOT_PROPERTY_MAP = """{"github":"oasis_github","role":"oasis_role","source":"oasis_source","organization":"oasis_organization","submitted_at":"oasis_submitted_at"}"""
```

Create those custom properties in HubSpot before enabling the mapping. The
free-text application reason is intentionally kept in D1 and is never sent to
HubSpot. Sync logs contain only counts and safe error categories.

---

## Deployment ownership

| Trigger | What happens |
|---------|-------------|
| Push to `main` | GitHub validates; Cloudflare Workers Builds deploys production |
| Pull Request | GitHub validates; Cloudflare may create a preview build |

GitHub Actions never deploys this Worker and does not hold Cloudflare deployment
credentials. Configure the `owasp-oasis` Workers Build with production branch
`main`, build command `npm run build`, deploy command `npm run deploy`, root
directory `/`, and build environment variable `NODE_VERSION=24`.

`npm run deploy` applies pending production D1 migrations before invoking
`wrangler deploy --env production`. The Workers Builds API token must therefore
include account-level **D1 Edit** and **Workers Scripts Edit** permissions. The
default auto-generated Workers Builds token does not include D1 access; select
a custom user API token in the Worker build settings.

---

## Commit convention

```
feat: add new section
fix: form submit broken on mobile
chore: update dependencies
docs: update README
style: improve spacing
```
