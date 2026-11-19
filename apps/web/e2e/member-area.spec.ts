import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { withAdminDb } from './db';
import { expect, failOnCspViolation, newLearner, signUp, submitSignIn, test } from './helpers';

// The learner's own pages: Overview, Activity, Settings, Help and their data. Invented text only.
const run = crypto.randomUUID().slice(0, 8);
const COURSE = `e2e-member-course-${run}`;
const LESSON = `e2e-member-lesson-${run}`;
const LESSON_TITLE = `Invented member lesson ${run}`;
const FAQ = `Invented FAQ e2e-${run}: how do Drills work?`;

test.describe.configure({ mode: 'serial' });

test('a finished lesson shows on the Overview and on Activity', async ({ page }) => {
  const editor = await signInAsAdmin('editor');
  const course = await createDoc(editor, 'courses', {
    title: `Invented member course ${run}`,
    slug: COURSE,
    level: 'basic',
    order: 1,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented member module',
    slug: `e2e-member-module-${run}`,
    course: course.id,
    order: 1,
  });
  const lesson = await createDoc(editor, 'lessons', {
    title: LESSON_TITLE,
    slug: LESSON,
    module: module.id,
    order: 1,
    preview: true,
    blocks: [paragraph('Invented text.')],
    _status: 'published',
  });
  expect(lesson.status).toBe(201);

  failOnCspViolation(page);
  await signUp(page, newLearner());
  const nav = page.getByRole('navigation', { name: 'Your account' });
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('0 of 3', { exact: true })).toBeVisible();

  await page.goto(ROUTES.lesson(COURSE, LESSON));
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('button', { name: '✓ Done' })).toBeVisible();
  await page.goto(ROUTES.dashboard);
  const recent = page.getByRole('region', { name: 'Recent activity' });
  await expect(recent).toContainText(LESSON_TITLE);
  await expect(recent).toContainText('Finished · just now');

  // Activity: a one-day streak, today's square, and the lesson in the list.
  await nav.getByRole('link', { name: 'Activity' }).click();
  await expect(nav.getByRole('link', { name: 'Activity' })).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('img', { name: 'Activity in the last 12 months: 1 done on 1 day' }),
  ).toBeVisible();
  await expect(page.getByTitle(/^1 done on /)).toHaveCount(1);
  await expect(recent).toContainText(LESSON_TITLE);

  // Help is public, but a signed-in learner keeps the sidebar there.
  await nav.getByRole('link', { name: 'Help' }).click();
  await expect(nav.getByRole('link', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
});

test('Settings change the name and password and show what the learner may open', async ({
  page,
}) => {
  failOnCspViolation(page);
  const learner = newLearner();
  await signUp(page, learner);
  await page.goto(ROUTES.settings);
  await expect(page.getByText('Not bought').first()).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Renamed Learner');
  await page.getByRole('button', { name: 'Save name' }).click();
  await page.getByRole('button', { name: 'Your account' }).click();
  await expect(page.getByText('Renamed Learner')).toBeVisible();
  await page.keyboard.press('Escape');

  await grantAccess(await signInAsAdmin('support'), learner.email);
  await page.reload();
  await expect(page.getByText(/^Open until /).first()).toBeVisible();

  const changed = `New-${learner.password}`;
  await page.getByLabel('Current password', { exact: true }).fill(learner.password);
  await page.getByLabel('New password', { exact: true }).fill(changed);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Your password was changed' }),
  ).toBeVisible();
  await page.context().clearCookies();
  await submitSignIn(page, { ...learner, password: changed });
  await expect(page).toHaveURL(ROUTES.dashboard);
});

// A 1×1 PNG: the server crops and re-encodes whatever it is given.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Clicks a save button and waits for the API call it makes to finish. */
async function saveVia(page: Page, button: string, path: string): Promise<void> {
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(path) && response.ok()),
    page.getByRole('button', { name: button }).click(),
  ]);
}

test('a learner fills in their profile and photo; a handle belongs to one learner', async ({
  page,
  browser,
}) => {
  failOnCspViolation(page);
  await signUp(page, newLearner());
  await page.goto(ROUTES.settings);
  const handle = `e2e_${run}`;
  await page.getByLabel('Handle').fill(handle);
  await page.getByLabel('Bio').fill('Invented bio for this test.');
  await page.getByLabel('GitHub').fill('https://gist.github.com/invented');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Use your GitHub address' }),
  ).toBeVisible();
  await page.getByLabel('GitHub').fill('https://github.com/invented');
  await saveVia(page, 'Save profile', API_ROUTES.profile);

  await page
    .getByLabel('Photo')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await saveVia(page, 'Upload photo', API_ROUTES.profilePhoto);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();

  // The Overview shows the profile; the menu shows the photo, served as a small WebP.
  await page.goto(ROUTES.dashboard);
  await expect(page.getByText(`@${handle}`)).toBeVisible();
  await expect(page.getByText('Invented bio for this test.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
    'href',
    'https://github.com/invented',
  );
  const menuPhoto = page.getByRole('button', { name: 'Your account' }).locator('img');
  const src = await menuPhoto.getAttribute('src');
  expect(src).toMatch(/^\/api\/v1\/profile\/photo\?v=\d+$/);
  expect((await page.request.get(src ?? '')).headers()['content-type']).toBe('image/webp');

  // Another learner cannot take the handle.
  const other = await (await browser.newContext()).newPage();
  await signUp(other, newLearner());
  await other.goto(ROUTES.settings);
  await other.getByLabel('Handle').fill(handle);
  await other.getByRole('button', { name: 'Save profile' }).click();
  await expect(other.getByRole('alert').filter({ hasText: 'That handle is taken' })).toBeVisible();
});

test('Help shows the published questions and answers', async ({ page }) => {
  const faq = await createDoc(await signInAsAdmin('editor'), 'faqs', {
    question: FAQ,
    answer: 'Invented answer for this test.',
    order: 1,
    _status: 'published',
  });
  expect(faq.status).toBe(201);
  failOnCspViolation(page);
  await page.goto(ROUTES.help);
  await page.getByText(FAQ).click();
  await expect(page.getByText('Invented answer for this test.')).toBeVisible();
});

/** Downloads the learner's data from Settings and reads the file. */
async function downloadData(page: Page): Promise<Record<string, unknown>> {
  await page.goto(ROUTES.settings);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download your data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^siliconbox-data-\d{4}-\d{2}-\d{2}\.json$/);
  return JSON.parse(await readFile(await file.path(), 'utf8')) as Record<string, unknown>;
}

test('a learner downloads their data, then deletes the account', async ({ page, request }) => {
  expect((await request.get(API_ROUTES.dataExport)).status()).toBe(401);
  failOnCspViolation(page);
  const learner = newLearner();
  await signUp(page, learner);
  const { id } = (await (await page.request.get(API_ROUTES.me)).json()) as { id: string };
  await page.goto(ROUTES.lesson(COURSE, LESSON));
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('button', { name: '✓ Done' })).toBeVisible();

  const data = await downloadData(page);
  expect(data).toMatchObject({
    account: { email: learner.email, signInMethods: ['password'] },
    lessonsFinished: [{ lesson: LESSON_TITLE }],
  });
  // Nothing secret: no password, and no session token (only chosen session fields).
  expect(JSON.stringify(data)).not.toContain(learner.password);
  expect(JSON.stringify(data.devices)).not.toContain('token');

  await page.getByLabel('Your password', { exact: true }).fill(learner.password);
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page).toHaveURL('/sign-in?reason=account-deleted');
  await expect(page.getByRole('status')).toContainText('Your account and its data were deleted');

  // The account and its data are gone; the audit record of the deletion stays.
  const left = await withAdminDb((db) =>
    Promise.all([
      db.collection('users').countDocuments({ email: learner.email }),
      db.collection('progress').countDocuments({ userId: id }),
      db.collection('watermark_codes').countDocuments({ userId: id }),
      db.collection('audit_log').countDocuments({ subjectId: id, action: 'account_deleted' }),
    ]),
  );
  expect(left).toEqual([0, 0, 0, 1]);
  await submitSignIn(page, learner);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid email or password' }),
  ).toBeVisible();
  // The teardown finds test learners by email, so this one's audit entries are removed here.
  await withAdminDb((db) => db.collection('audit_log').deleteMany({ subjectId: id }));
});
