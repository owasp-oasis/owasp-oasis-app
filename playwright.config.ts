import { defineConfig, devices } from '@playwright/test'

// Browser checks use the isolated local preview: synthetic sessions, a local
// database, and no outbound Worker requests.
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  use: { baseURL: 'http://127.0.0.1:4176', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && TEAMS_PREVIEW_PORT=4176 node scripts/teams-preview.mjs',
    url: 'http://127.0.0.1:4176/workspace/fixes',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
