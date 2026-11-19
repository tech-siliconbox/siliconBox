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
  const refused = await page.request.get(API_ROUTES.resumes);
  expect(refused.status()).toBe(403);
  expect(await refused.json()).toMatchObject({ error: { code: 'NOT_ENTITLED' } });
});

test('an entitled learner builds a resume that saves itself and downloads as PDF and Word', async ({
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
  const status = page.getByRole('status');
  await expect(status).toHaveText('Unsaved changes');
  await expect(status).toHaveText('All changes saved', { timeout: 10_000 });

  await page.reload();
  await expect(page.getByLabel('Company')).toHaveValue('Invented Chips');
  await expect(page.getByLabel('Resume preview')).toContainText(
    'Verification Intern, Invented Chips',
  );

  const downloadAs = async (label: string, name: string) => {
    await page.getByText('Download', { exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: label }).click();
    const path = info.outputPath(name);
    await (await download).saveAs(path);
    return readFileSync(path);
  };
  pdfPath = info.outputPath('resume.pdf');
  expect((await downloadAs('PDF (send this)', 'resume.pdf')).subarray(0, 5).toString()).toBe(
    '%PDF-',
  );
  expect((await downloadAs('Word (.docx)', 'resume.docx')).subarray(0, 2).toString()).toBe('PK');
});

test('Resume Builder keeps several resumes, with sections, design, undo and imports', async ({
  page,
}) => {
  failOnCspViolation(page);
  await signIn(page);
  await page.goto(ROUTES.resumeBuilder);
  const preview = page.getByLabel('Resume preview');
  const status = page.getByRole('status');

  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByLabel('Heading (Skills)').fill('Technical skills');
  await page.getByRole('button', { name: '+ Add your own section' }).click();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByText('Modern', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Modern' })).toBeChecked();
  await expect(status).toHaveText('All changes saved', { timeout: 10_000 });

  await page.getByLabel(/^Two or three lines/).fill('Proves **AXI** bridges.');
  await expect(preview).toContainText('Proves AXI bridges.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(preview).not.toContainText('Proves AXI bridges.');

  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(/\(copy\)$/);
  await expect(page.getByLabel('Resume', { exact: true }).locator('option')).toHaveCount(2);

  await page.getByRole('button', { name: 'Tailor with AI' }).click();
  await expect(page.getByText('Coming soon')).toBeVisible();

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByLabel('JSON Resume file').setInputFiles({
    name: 'resume.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ basics: { name: 'Imported Person' }, work: [] })),
  });
  await expect(page.getByText('Imported as a new resume')).toBeVisible();
  await expect(preview).toContainText('Imported Person');
  await expect(page.getByLabel('Resume', { exact: true }).locator('option')).toHaveCount(3);
});

test('Resume Builder checks its own PDF against a job description', async ({ page }) => {
  failOnCspViolation(page);
  await signIn(page);
  await page.goto(ROUTES.resumeBuilder);

  await page.getByLabel('Resume', { exact: true }).selectOption({ label: 'My resume' });
  await page.getByRole('button', { name: 'Check', exact: true }).click();
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
