import { readFileSync } from 'node:fs';
import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import { BASE_URL } from './base-url';
import { grantAccess, signInAsAdmin } from './cms/publish';
import { withAdminDb } from './db';
import type { Page } from '@playwright/test';
import { expect, failOnCspViolation, newLearner, signUp, submitSignIn, test } from './helpers';

const learner = newLearner();
let pdfPath = '';
/** An invented posting: the resume shows SVA and JasperGold, not UVM (2 of 3, all requirements). */
const POSTING = 'Requirements\n- SVA and JasperGold\n- UVM';

async function signIn(page: Page): Promise<void> {
  await submitSignIn(page, learner);
  await expect(page).toHaveURL(ROUTES.dashboard);
}

test.describe.configure({ mode: 'serial' });

test('a learner without active access is shown the way forward, and the API refuses', async ({
  page,
}) => {
  await signUp(page, learner);
  await page.goto(ROUTES.resumeBuilder);
  await expect(page.getByText('Free for learners with an active course')).toBeVisible();
  const refused = await page.request.get(API_ROUTES.resume);
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ error: { code: 'NOT_ENTITLED' } });
});

test('an entitled learner builds, saves and downloads an ATS-friendly resume', async ({
  page,
}, info) => {
  failOnCspViolation(page);
  await grantAccess(await signInAsAdmin('support'), learner.email);
  await signIn(page);
  await page.goto(ROUTES.resumeBuilder);

  await page.getByLabel('Headline').fill('Formal Verification Engineer');
  await page.getByRole('button', { name: '+ Add role' }).click();
  await page.getByLabel('Role', { exact: true }).fill('Verification Intern');
  await page.getByLabel('Company').fill('Invented Chips');
  await page.getByLabel('Start').first().fill('2025-01');
  await page
    .getByLabel(/^Achievements/)
    .fill('Wrote 42 SVA properties for an AXI4 bridge with JasperGold.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'All changes saved' })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Company')).toHaveValue('Invented Chips');
  await expect(page.getByLabel('Resume preview')).toContainText(
    'Verification Intern, Invented Chips',
  );

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  pdfPath = info.outputPath('resume.pdf');
  await (await download).saveAs(pdfPath);
  expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe('%PDF-');
});

test('Resume Builder checks its own PDF against a job description', async ({ page }) => {
  failOnCspViolation(page);
  await signIn(page);
  await page.goto(ROUTES.resumeBuilder);

  await page.getByRole('button', { name: 'Check resume' }).click();
  const panel = page.getByRole('region', { name: 'Check this resume' });
  await panel.getByLabel('Job description (optional)').fill(POSTING);
  await panel.getByRole('button', { name: 'Run the check' }).click();
  const report = panel.getByRole('article', { name: 'CV screening report' });
  await expect(report).toContainText('Match with the job description');
  await expect(report).toContainText('67%');
  await panel.getByText('What an ATS reads').click();
  await expect(panel.locator('pre')).toContainText('Invented Chips');
});

test('CV screening reads the resume PDF, matches a job, keeps the file, deletes both', async ({
  page,
}) => {
  failOnCspViolation(page);
  await signIn(page);
  await page.goto(ROUTES.cvScreening);

  await page.locator('input[type=file]').setInputFiles({
    name: 'cv.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('not really a pdf'),
  });
  await page.getByRole('button', { name: 'Screen my CV' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Upload a PDF or Word' })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles(pdfPath);
  await page.getByLabel('Job description (optional)').fill(POSTING);
  await page.getByRole('button', { name: 'Screen my CV' }).click();
  const report = page.getByRole('article', { name: 'CV screening report' });
  await expect(report).toContainText('Formal verification keywords');
  await expect(report).toContainText('SVA');
  await expect(report).toContainText('67%');
  await page.getByText('What an ATS reads').click();
  await expect(page.locator('pre')).toContainText('Invented Chips');

  // The CV is kept with its report and comes back as a download.
  const fileLink = page.getByRole('link', { name: /^Download / });
  const fileUrl = (await fileLink.getAttribute('href')) ?? '';
  const download = page.waitForEvent('download');
  await fileLink.click();
  expect(
    readFileSync(await (await download).path())
      .subarray(0, 5)
      .toString(),
  ).toBe('%PDF-');

  // AI feedback is refused without the learner's agreement to the current notice.
  const feedbackUrl = fileUrl.replace(/\/file$/, '/feedback');
  const unagreed = await page.request.post(feedbackUrl, {
    data: {},
    headers: { origin: BASE_URL },
  });
  expect(unagreed.status()).toBe(400);

  await page.getByRole('button', { name: /Delete report for/ }).click();
  await expect(report).toHaveCount(0);
  expect((await page.request.get(fileUrl)).status()).toBe(404);
});

test('a service locked in the admin refuses every call', async ({ page }) => {
  await signIn(page);
  const setStatus = (status: string) =>
    withAdminDb((db) =>
      db.collection('services').updateOne({ slug: 'cv-screening' }, { $set: { status } }),
    );
  await setStatus('locked');
  try {
    const response = await page.request.get(API_ROUTES.cvScreenings);
    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_LOCKED' } });
  } finally {
    await setStatus('open');
  }
});
