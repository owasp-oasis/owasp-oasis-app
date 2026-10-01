/** Generate an isolated candidate configuration. This script never deploys anything. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unstable_readConfig } from 'wrangler';
const { OASIS_STAGING_DB_ID, OASIS_STAGING_KV_ID, OASIS_STAGING_RECIPIENT } = process.env;
assert.match(OASIS_STAGING_DB_ID ?? '', /^[a-f0-9-]{36}$/);
assert.match(OASIS_STAGING_KV_ID ?? '', /^[a-f0-9]{32}$/);
assert.match(OASIS_STAGING_RECIPIENT ?? '', /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
const production = unstable_readConfig({ config: 'wrangler.toml', env: 'production' });
assert.notEqual(OASIS_STAGING_DB_ID, production.d1_databases[0].database_id);
assert.notEqual(OASIS_STAGING_KV_ID, production.kv_namespaces[0].id);
const config = {
  name: production.name,
  main: resolve('dist-worker/index.js'),
  compatibility_date: production.compatibility_date,
  workers_dev: false, preview_urls: true,
  assets: { ...production.assets, directory: resolve('dist') },
  vars: {
    ENVIRONMENT: 'email-staging', WELCOME_EMAIL_MODE: 'test',
    WELCOME_EMAIL_FROM: production.vars.WELCOME_EMAIL_FROM,
    WELCOME_EMAIL_TEST_RECIPIENT: OASIS_STAGING_RECIPIENT,
    OAUTH_CALLBACK_URL: 'https://www.owasp-oasis.org/api/auth/callback',
  },
  send_email: [{ name: 'WELCOME_EMAIL',
    allowed_sender_addresses: ['welcome@mail.owasp-oasis.org'],
    allowed_destination_addresses: [OASIS_STAGING_RECIPIENT] }],
  d1_databases: [{ binding: 'DB', database_name: 'oasis-email-staging', database_id: OASIS_STAGING_DB_ID }],
  kv_namespaces: [{ binding: 'RATE_KV', id: OASIS_STAGING_KV_ID }],
  observability: production.observability,
};
mkdirSync('.wrangler', { recursive: true });
writeFileSync('.wrangler/welcome-staging.json', JSON.stringify(config, null, 2), { mode: 0o600 });
console.log('Prepared isolated staging config. Upload with: npx wrangler versions upload --config .wrangler/welcome-staging.json');
console.log('Do not use wrangler deploy with this config: it targets a non-live version of the production Worker.');
