import { ROUTES } from '@siliconbox/shared';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, newLearner, signUp, submitSignIn, test } from './helpers';

// The learner's own pages: Overview, Settings and Help. Invented course and FAQ text only.
const run = crypto.randomUUID().slice(0, 8);
const COURSE = `e2e-member-course-${run}`;
const LESSON = `e2e-member-lesson-${run}`;
const LESSON_TITLE = `Invented member lesson ${run}`;
const FAQ = `Invented FAQ e2e-${run}: how do Drills work?`;

test.describe.configure({ mode: 'serial' });

test('a finished lesson shows on the Overview and on Activity', async ({ page }) => {
  test.setTimeout(60_000);
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
  test.setTimeout(60_000);
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
