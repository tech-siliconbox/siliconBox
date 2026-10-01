import type { Browser, Page } from '@playwright/test';
import { expect, failOnCspViolation, newLearner, signUp, submitSignIn, test } from './helpers';

const learner = newLearner();

async function signInOnNewDevice(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  failOnCspViolation(page);
  await submitSignIn(page, learner);
  await expect(page).toHaveURL('/account');
  return page;
}

test.describe.configure({ mode: 'serial' });

test('a new learner signs up and sees their watermarked account page', async ({ page }) => {
  failOnCspViolation(page);
  await signUp(page, learner);
  await expect(page.getByText(learner.email)).toBeVisible();
  await expect(page.locator('[data-watermark] text')).toContainText('lea…@example.test');
});

test('signing in on a second device signs the first out with a reason', async ({ browser }) => {
  const firstDevice = await signInOnNewDevice(browser);
  await signInOnNewDevice(browser);

  // The open page notices on its next check (every minute, or on focus).
  await firstDevice.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(firstDevice).toHaveURL('/sign-in?reason=replaced');
  await expect(firstDevice.getByRole('status')).toContainText('signed in on another device');
});

test('the account API refuses a request without a session', async ({ request }) => {
  const response = await request.get('/api/v1/me');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
});

test('the account page sends a signed-out visitor to sign-in', async ({ page }) => {
  await page.goto('/account');
  await expect(page).toHaveURL('/sign-in');
});

test('pricing shows the server-side prices', async ({ page }) => {
  failOnCspViolation(page);
  await page.goto('/pricing');
  for (const price of ['₹5,000', '₹10,000', '₹15,000']) {
    await expect(page.getByText(price, { exact: true })).toBeVisible();
  }
});
