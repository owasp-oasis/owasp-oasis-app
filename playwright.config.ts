import { defineConfig, devices } from '@playwright/test'

/**
 * Browser-level Workspace checks run against the isolated local UX preview.
 * The preview uses synthetic identities and blocks outbound requests; this
 * suite must never point at preview.owasp-oasis.org or production.
 */
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4176',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && TEAMS_PREVIEW_PORT=4176 node scripts/teams-preview.mjs',
    url: 'http://127.0.0.1:4176/workspace/validators',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
