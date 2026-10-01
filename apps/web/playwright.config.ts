import { defineConfig, devices } from '@playwright/test';

// Runs against a local stack: `docker compose up -d`, `pnpm db:migrate`, `pnpm build`.
export default defineConfig({
  testDir: 'e2e',
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: process.env.CI !== undefined,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: process.env.CI === undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
