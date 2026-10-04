import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = await readFile(resolve(root, 'apps-script/Registrations.gs'), 'utf8');
const manifest = JSON.parse(await readFile(resolve(root, 'apps-script/appsscript.json'), 'utf8'));

const requiredFunctions = ['doPost', 'doGet', 'syncRegistrations', 'setAdminSecret', 'writeToSheet', 'logSync', 'onOpen'];
for (const name of requiredFunctions) {
  if (!new RegExp(`function\\s+${name}\\s*\\(`).test(source)) {
    throw new Error(`Apps Script source is missing ${name}()`);
  }
}

if (!source.includes("getProperty('ADMIN_SECRET')")) {
  throw new Error('Apps Script must read ADMIN_SECRET from Script Properties');
}
if (/setProperties\s*\(\s*\{[\s\S]*ADMIN_SECRET\s*:\s*['"]/.test(source)) {
  throw new Error('Apps Script must not contain a hardcoded ADMIN_SECRET');
}
if (/ADMIN_SECRET\s*:\s*['"][A-Za-z0-9_-]{32,}['"]/.test(source)) {
  throw new Error('Apps Script contains a secret-like ADMIN_SECRET literal');
}
if (manifest.runtimeVersion !== 'V8' || manifest.webapp?.access !== 'ANYONE_ANONYMOUS') {
  throw new Error('Apps Script manifest does not preserve the web-app runtime/access contract');
}

console.log('Apps Script source and manifest checks passed');
