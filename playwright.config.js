// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * E2E config — assumes:
 *   - Server is running on :5001 (cd server && npm start)
 *   - Client is running on :3000 (cd client && NODE_OPTIONS=--openssl-legacy-provider BROWSER=none npm start)
 *
 * Set START_SERVERS=1 to have Playwright boot them automatically.
 */
const useWebServer = process.env.START_SERVERS === '1';

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: false,        // tests share a single MongoDB; keep them serial for safety
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: useWebServer
    ? [
        {
          command: 'npm start',
          cwd: './server',
          url: 'http://localhost:5001/api/auth/me',  // 401 means it's up
          reuseExistingServer: true,
          timeout: 60_000,
          ignoreHTTPSErrors: true,
        },
        {
          command: 'NODE_OPTIONS=--openssl-legacy-provider BROWSER=none npm start',
          cwd: './client',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 120_000,
        },
      ]
    : undefined,
});
