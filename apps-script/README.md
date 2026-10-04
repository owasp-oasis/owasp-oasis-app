# Google Sheets registration sync

This directory is the source-controlled copy of Apps Script project
`116TaS4GX3zRwtXs2DmM6IS5klXfpaaD3w5sDT55pCOq58W99LdpZ9myH`.

`Registrations.gs` receives the registration export from GitHub Actions and
writes it to the `Registrations` and `Sync Log` tabs. The web app continues to
use the existing deployment URL configured in the `GOOGLE_SHEETS_WEBHOOK`
GitHub secret.

## Secrets

`ADMIN_SECRET` is an Apps Script Script Property. It is intentionally absent
from this repository. After creating a new Apps Script project or restoring a
project, run `setAdminSecret` once from the Apps Script editor with the value
from the deployment secret store. GitHub Actions uses the same value as its
`ADMIN_SECRET` secret.

## Deployment

The supported deployment script is:

```sh
node scripts/deploy-apps-script.mjs
```

It updates the Apps Script source, creates a numbered version, and updates the
configured web-app deployment. It requires these environment variables:

- `GOOGLE_APPS_SCRIPT_ID`
- `GOOGLE_APPS_SCRIPT_DEPLOYMENT_ID`
- `GOOGLE_APPS_SCRIPT_CLIENT_ID`
- `GOOGLE_APPS_SCRIPT_CLIENT_SECRET`
- `GOOGLE_APPS_SCRIPT_REFRESH_TOKEN`

The OAuth client must be allowed to use the Apps Script API and have the
`script.projects` and `script.deployments` scopes. Keep all OAuth values in the
CI secret store; never add them to this repository.
