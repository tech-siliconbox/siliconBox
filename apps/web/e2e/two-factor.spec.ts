import {
  expect,
  failOnCspViolation,
  newLearner,
  signUp,
  submitSignIn,
  test,
  totpCode,
} from './helpers';

test('a learner turns on two-factor, signs in with a backup code, then turns it off', async ({
  page,
}) => {
  const learner = newLearner();
  failOnCspViolation(page);
  await signUp(page, learner);
  const status = page.getByTestId('two-factor-status');
  await expect(status).toContainText('Off.');

  await page.getByLabel('Confirm your password').fill(learner.password);
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();
  const key = (await page.getByTestId('totp-key').textContent()) ?? '';
  const backupCode =
    (await page.getByTestId('backup-codes').locator('li').first().textContent()) ?? '';
  await page.getByLabel('Code from your authenticator app').fill(totpCode(key));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(status).toContainText('On.');

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await submitSignIn(page, learner);
  await expect(page).toHaveURL('/sign-in/two-factor');
  await page.getByLabel(/backup code/).fill(backupCode);
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL('/account');

  await page.getByLabel('Confirm your password').fill(learner.password);
  await page.getByRole('button', { name: 'Turn off two-factor' }).click();
  await expect(status).toContainText('Off.');
});

test('the two-factor step refuses a wrong code', async ({ page }) => {
  const learner = newLearner();
  await signUp(page, learner);
  await page.getByLabel('Confirm your password').fill(learner.password);
  await page.getByRole('button', { name: 'Turn on two-factor' }).click();
  await page.getByLabel('Code from your authenticator app').fill('000000');
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('two-factor-status')).toContainText('Off.');
});
