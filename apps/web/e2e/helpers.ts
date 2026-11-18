import { type Page, test as base, expect } from '@playwright/test';

/**
 * Each test acts from its own client IP, as separate visitors would. Locally no proxy sets
 * the header, so otherwise every test would share one rate-limit bucket.
 */
export const test = base.extend({
  // Playwright reads fixture dependencies from this pattern, so it must be an object pattern.
  // eslint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'x-real-ip': `e2e-${crypto.randomUUID()}` });
  },
});

export { expect };

export type Learner = { name: string; email: string; password: string };

/** An invented learner with a fresh address per run. */
export function newLearner(): Learner {
  return {
    name: 'Test Learner',
    email: `learner-${crypto.randomUUID()}@example.test`,
    password: `Pw-${crypto.randomUUID()}`,
  };
}

export function failOnCspViolation(page: Page): void {
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) {
      throw new Error(`CSP violation: ${message.text()}`);
    }
  });
}

export async function signUp(page: Page, learner: Learner): Promise<void> {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(learner.name);
  await page.getByLabel('Email').fill(learner.email);
  await page.getByLabel('Password', { exact: true }).fill(learner.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL('/dashboard');
}

/** Email and password step only; the caller checks where it lands. */
export async function submitSignIn(page: Page, learner: Learner): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(learner.email);
  await page.getByLabel('Password', { exact: true }).fill(learner.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
