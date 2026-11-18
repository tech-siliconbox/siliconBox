import type { Browser, Page } from '@playwright/test';
import { withAdminDb } from './db';
import { expect, failOnCspViolation, newLearner, signUp, submitSignIn, test } from './helpers';

const learner = newLearner();

async function signInOnNewDevice(browser: Browser, userAgent?: string): Promise<Page> {
  const page = await (
    await browser.newContext(userAgent === undefined ? {} : { userAgent })
  ).newPage();
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
  // Public pages know the learner is signed in.
  await page.goto('/pricing');
  await expect(page.getByRole('link', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveCount(0);
});

test('signing in on a second device signs the first out with a reason', async ({ browser }) => {
  const firstDevice = await signInOnNewDevice(browser);
  await signInOnNewDevice(browser);

  // The open page notices on its next check (every minute, or on focus).
  await firstDevice.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(firstDevice).toHaveURL('/sign-in?reason=replaced');
  await expect(firstDevice.getByRole('status')).toContainText('signed in on another device');
});

test('a sign-in from a headless browser is recorded as a security alert', async ({ browser }) => {
  const page = await signInOnNewDevice(
    browser,
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/131.0',
  );
  const account = (await (await page.request.get('/api/v1/me')).json()) as { id: string };
  const alerts = await withAdminDb((db) =>
    db
      .collection('security-alerts')
      .countDocuments({ userId: account.id, kind: 'headless_browser' }),
  );
  expect(alerts).toBeGreaterThan(0);
});

test('the account API refuses a request without a session', async ({ request }) => {
  const response = await request.get('/api/v1/me');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
});

test('a Google sign-in for an email with a password account says how to sign in', async ({
  page,
}) => {
  await page.goto('/sign-in?error=account_not_linked');
  await expect(page.getByRole('status')).toContainText('Sign in with your email and password');
});

test('a learner resets a forgotten password from the emailed link', async ({ page }) => {
  const forgetful = newLearner();
  await signUp(page, forgetful);
  const { id } = (await (await page.request.get('/api/v1/me')).json()) as { id: string };
  await page.context().clearCookies();

  await page.goto('/sign-in');
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(forgetful.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(
    'a link to set a new password is on its way',
  );

  // Test addresses get no email; the link the email would carry holds this one-time token.
  const [reset] = await withAdminDb((db) =>
    db
      .collection('verifications')
      .find({ value: id, identifier: /^reset-password:/ })
      .toArray(),
  );
  const token = String(reset?.identifier).replace('reset-password:', '');
  await page.goto(`/api/auth/reset-password/${token}?callbackURL=%2Freset-password`);
  await expect(page).toHaveURL(`/reset-password?token=${token}`);

  const password = page.getByLabel('New password', { exact: true });
  await password.fill(`New-${forgetful.password}`);
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page).toHaveURL('/sign-in?reason=password-changed');
  await expect(page.getByRole('status')).toContainText('Your password was changed');

  await submitSignIn(page, { ...forgetful, password: `New-${forgetful.password}` });
  await expect(page).toHaveURL('/account');
});

test('a used or broken reset link says so', async ({ page }) => {
  await page.goto('/reset-password?error=INVALID_TOKEN');
  await expect(
    page.getByRole('alert').filter({ hasText: 'expired or was already used' }),
  ).toBeVisible();
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
