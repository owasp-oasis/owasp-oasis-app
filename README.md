# OWASP OASIS — Site

Live at: https://www.owasp-oasis.com + https://www.owasp-oasis.org

---

## 🚀 Quick deploy

```bash
git push origin main   # triggers auto-deploy via GitHub Actions
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
# → GitHub Actions will run lint checks automatically
# → Get a review from a teammate
# → Merge to main → auto-deploys to live site ✅
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
| `wrangler.toml` | Cloudflare config |
| `schema.sql` | DB schema (fresh installs only) |
| `export-db.js` | Export DB to CSV |
| `google-sheets-sync.js` | Google Sheets auto-sync |
| `.dev.vars` | Local secrets — git-ignored |
| `.github/workflows/deploy.yml` | Auto-deploy pipeline |

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
npx wrangler secret list
```

---

## GitHub Actions

| Trigger | What happens |
|---------|-------------|
| Push to `main` | Lint + auto-deploy to production |
| Pull Request | Lint checks only (no deploy) |
| Manual | GitHub → Actions → Run workflow |

---

## Commit convention

```
feat: add new section
fix: form submit broken on mobile
chore: update dependencies
docs: update README
style: improve spacing
```
