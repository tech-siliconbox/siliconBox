import { ROUTES } from '@siliconbox/shared';
import { grantAccess, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, newLearner, signUp, test } from './helpers';

// Praman's page (ADR 0031): a learner loads the example, proves it, and sees the failing assertion
// with its waveform. Needs the solver API and its session supervisor, as praman-api.spec.ts does.

test.describe.configure({ mode: 'serial' });

const PROOF_TIMEOUT = 120_000;

test('without a plan and a tool window Praman is locked', async ({ page }) => {
  await signUp(page, newLearner());
  await page.goto(ROUTES.tool);
  await expect(page.getByText('Locked')).toBeVisible();
  await expect(page.getByRole('link', { name: 'See pricing' })).toBeVisible();
});

test('a learner proves the example and opens the waveform of the failing assertion', async ({
  page,
}) => {
  test.setTimeout(240_000);
  failOnCspViolation(page);
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');

  await page.getByRole('link', { name: 'Formal Tool' }).first().click();
  await expect(page.getByRole('heading', { name: 'Praman' })).toBeVisible();
  await page.getByRole('button', { name: 'New session' }).click();
  await expect(page.getByText('Session open')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.getByRole('button', { name: 'fifo.sv' })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('button', { name: 'Elaborate', exact: true }).click();
  await page.getByLabel('Top module').fill('fifo');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Clock and reset' }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Prove', exact: true }).click();

  // The assertion's own row (its related covers have rows too) shows its counterexample.
  const failing = page
    .getByRole('row')
    .filter({ hasText: 'a_no_overflow' })
    .filter({ hasText: 'CEX' });
  await expect(failing.first()).toBeVisible({ timeout: PROOF_TIMEOUT });
  await failing.first().getByRole('button', { name: 'Waveform' }).click();
  const waveform = page.getByRole('region', { name: /Waveform of/ });
  await expect(waveform.locator('svg')).toBeVisible();
  await expect(waveform).toContainText('count');
});

test('on a phone the page asks for a larger screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  await page.goto(ROUTES.tool);
  await expect(page.getByText('Open this page on a computer or a tablet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New session' })).toBeHidden();
});
