import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const config = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
function section(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return config.match(new RegExp(`^\\[${escaped}\\]\\s*\\n([\\s\\S]*?)(?=^\\[|$(?![\\s\\S]))`, 'm'))?.[1] ?? '';
}
assert.match(section('env.production.vars'), /^WELCOME_EMAIL_MODE\s*=\s*"live"/m,
  'Production welcome email must remain enabled in versioned config.');
assert.match(section('env.production.vars'), /^WELCOME_EMAIL_FROM\s*=\s*"OASIS <welcome@mail\.owasp-oasis\.org>"/m);
assert.match(config, /\[\[env\.production\.send_email\]\]\s*\nname\s*=\s*"WELCOME_EMAIL"/,
  'Production welcome email binding is missing.');
assert.match(section('vars'), /^WELCOME_EMAIL_MODE\s*=\s*"off"/m,
  'Shared preview must not send unsolicited welcome emails.');
const hubspot = readFileSync(new URL('../worker/hubspot.ts', import.meta.url), 'utf8');
assert.match(hubspot, /await deliverWelcomeEmail\(submission, env, fetcher, nowDate\)/,
  'The deployed queue processor must invoke welcome delivery.');
for (const path of ['worker/welcomeEmail.ts', 'worker/welcomeEmailTemplate.ts',
  'migrations/0016_welcome_email_deliveries.sql', 'public/logo/oasis-wordmark-full.jpg']) {
  assert.ok(existsSync(new URL('../' + path, import.meta.url)), `Missing release artifact: ${path}`);
}
console.log('Welcome email deployment contract passed.');
