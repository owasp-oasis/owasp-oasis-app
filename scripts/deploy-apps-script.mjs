import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const scriptId = process.env.GOOGLE_APPS_SCRIPT_ID;
const deploymentId = process.env.GOOGLE_APPS_SCRIPT_DEPLOYMENT_ID;
const clientId = process.env.GOOGLE_APPS_SCRIPT_CLIENT_ID;
const clientSecret = process.env.GOOGLE_APPS_SCRIPT_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_APPS_SCRIPT_REFRESH_TOKEN;

for (const [name, value] of Object.entries({
  GOOGLE_APPS_SCRIPT_ID: scriptId,
  GOOGLE_APPS_SCRIPT_DEPLOYMENT_ID: deploymentId,
  GOOGLE_APPS_SCRIPT_CLIENT_ID: clientId,
  GOOGLE_APPS_SCRIPT_CLIENT_SECRET: clientSecret,
  GOOGLE_APPS_SCRIPT_REFRESH_TOKEN: refreshToken,
})) {
  if (!value) throw new Error(`${name} is required`);
}

const root = resolve(import.meta.dirname, '..');
const files = [
  {
    name: 'appsscript',
    type: 'JSON',
    source: await readFile(resolve(root, 'apps-script/appsscript.json'), 'utf8'),
  },
  {
    name: 'Registrations',
    type: 'SERVER_JS',
    source: await readFile(resolve(root, 'apps-script/Registrations.gs'), 'utf8'),
  },
];

async function getAccessToken() {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`Google OAuth token refresh failed (HTTP ${response.status})`);
  }
  return body.access_token;
}

const accessToken = await getAccessToken();
const baseUrl = `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}`;

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Apps Script API request failed (HTTP ${response.status})`);
  }
  return body;
}

await api('/content', {
  method: 'PUT',
  body: JSON.stringify({ files }),
});

const version = await api('/versions', {
  method: 'POST',
  body: JSON.stringify({
    description: `Source-controlled deployment ${process.env.GITHUB_SHA || new Date().toISOString()}`,
  }),
});

const currentDeployment = await api(`/deployments/${encodeURIComponent(deploymentId)}`);
const deploymentConfig = {
  ...(currentDeployment.deploymentConfig || {}),
  scriptId,
  versionNumber: Number(version.versionNumber),
  manifestFileName: 'appsscript',
};
await api(`/deployments/${encodeURIComponent(deploymentId)}`, {
  method: 'PUT',
  body: JSON.stringify({ deploymentConfig }),
});

console.log(`Apps Script source updated and deployment ${deploymentId} now points to version ${version.versionNumber}.`);
