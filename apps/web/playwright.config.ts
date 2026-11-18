import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './e2e/base-url';

// Runs against a local stack: `docker compose up -d`, `pnpm db:migrate`, `pnpm build`.
// E2E_BASE_URL=http://localhost:3100 runs a production server on that port, beside `pnpm dev`.
export default defineConfig({
  testDir: 'e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  // Many tests create CMS admins (each a `payload run` process) and sign learners up; with
  // several workers sharing the machine that takes longer than Playwright's 30 s default.
  timeout: 60_000,
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm start --port ${new URL(BASE_URL).port || '3000'}`,
    url: BASE_URL,
    // Sign-in links and origin checks follow the address the tests use.
    env: { BETTER_AUTH_URL: BASE_URL },
    reuseExistingServer: process.env.CI === undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
