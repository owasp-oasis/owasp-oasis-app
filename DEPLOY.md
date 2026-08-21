# OWASP OASIS — Cloudflare Deployment Guide

## Files
| File | Purpose |
|------|---------|
| `index.html` | The website |
| `worker.js` | Cloudflare Worker (API + HTML serving) |
| `hubspot.js` | Durable HubSpot contact synchronization |
| `wrangler.toml` | Worker configuration |
| `schema.sql` | D1 database tables |
| `migrations/` | Production D1 migrations and HubSpot backfill |

---

## Step 1 — Install Wrangler
```bash
npm install -g wrangler
wrangler login
```

---

## Step 2 — Create D1 Database
```bash
npx wrangler d1 create oasis-db
```
Copy the `database_id` from the output and paste it into `wrangler.toml`.

Then create the tables:
```bash
npx wrangler d1 execute oasis-db --file=schema.sql
```

For an existing deployment, apply pending migrations before deploying the
Worker. The GitHub Actions production job performs this step automatically:

```bash
npx wrangler d1 migrations apply oasis-db --remote --env production
```

---

## Step 3 — Create KV Namespace (rate limiting)
```bash
npx wrangler kv:namespace create RATE_KV
npx wrangler kv:namespace create RATE_KV --preview
```
Copy both IDs into `wrangler.toml`.

---

## Step 4 — Test locally
```bash
npx wrangler dev
```
Open `http://localhost:8787` — fill in the form and check it works.

---

## Step 5 — Deploy
```bash
npx wrangler deploy --env production
```

Before deployment, confirm the existing `owasp-oasis` Worker has a
`HUBSPOT_TOKEN` secret with `crm.objects.contacts.read` and
`crm.objects.contacts.write` scopes. Do not place the token in `wrangler.toml`.

Production runs HubSpot reconciliation at `15 * * * *`. Failed jobs stay in
`hubspot_sync_queue`, use capped exponential backoff, and are retried without
blocking registration or application responses. The initial migration queues
existing records for backfill.

Optional OASIS metadata can be mapped to pre-created HubSpot custom contact
properties with the non-secret `HUBSPOT_PROPERTY_MAP` JSON variable. Supported
keys are `github`, `role`, `source`, `organization`, and `submitted_at`.
Application free text is deliberately excluded from HubSpot.

---

## Security features included
| Feature | Detail |
|---------|--------|
| HTTPS redirect | HTTP → HTTPS enforced at Worker level |
| Apex redirect | `owasp-oasis.com` → `www.owasp-oasis.com` |
| Security headers | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| CSRF protection | Double-submit cookie pattern, constant-time comparison |
| Rate limiting | 5 submissions per IP per 60 seconds via KV |
| Input validation | Email (RFC 5322), GitHub format, max lengths, HTML stripping |
| SQL injection | Impossible — D1 parameterised queries only |
| Command injection | Impossible — no shell execution |
| IP privacy | SHA-256 hashed before storage (GDPR compliant) |
| Error messages | Generic client errors — no stack traces exposed |
