import { ROUTES } from '@siliconbox/shared';
import type { APIRequestContext, Browser } from '@playwright/test';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { withAdminDb } from './db';
import { BASE_URL } from './base-url';
import { expect, newLearner, signUp, test } from './helpers';

// A leak traced back: a learner reads a paid lesson, their copy is pasted into the admin tool.
const run = crypto.randomUUID().slice(0, 8);
const PASSAGE = `Invented passage for tracing ${run}.`;

/** A published paid lesson holding PASSAGE; returns its public id. */
/** Publishes an invented lesson and returns its page address. */
async function publishTraceLesson(editor: APIRequestContext): Promise<string> {
  const course = await createDoc(editor, 'courses', {
    title: `Invented trace course ${run}`,
    slug: `e2e-trace-course-${run}`,
    level: 'basic',
    order: 1,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented module',
    slug: `e2e-trace-module-${run}`,
    course: course.id,
    order: 1,
  });
  const lesson = await createDoc(editor, 'lessons', {
    title: 'Invented trace lesson',
    slug: `e2e-trace-lesson-${run}`,
    module: module.id,
    order: 1,
    blocks: [paragraph(PASSAGE)],
    _status: 'published',
  });
  expect(lesson.status).toBe(201);
  return ROUTES.lesson(`e2e-trace-course-${run}`, `e2e-trace-lesson-${run}`);
}

/** A browser page signed in as the CMS admin behind `client`. */
async function adminPage(browser: Browser, client: APIRequestContext) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addCookies((await client.storageState()).cookies);
  return context.newPage();
}

test('Support traces a copied passage and a visible mark to the learner; others cannot', async ({
  page,
  browser,
}) => {
  const editor = await signInAsAdmin('editor');
  const lessonPage = await publishTraceLesson(editor);

  // The learner reads the paid lesson; what they could copy carries both marks.
  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await page.goto(lessonPage);
  const copied = (await page.getByText(PASSAGE.slice(9)).textContent()) ?? '';
  const visible = (await page.locator('[data-watermark] text').first().textContent()) ?? '';

  // Support pastes the copied passage, then the visible mark.
  const tool = await adminPage(browser, support);
  await tool.goto(ROUTES.watermarkTrace);
  for (const leak of [copied, visible]) {
    await tool.getByLabel('Leaked text or visible mark').fill(leak);
    await tool.getByRole('button', { name: 'Trace' }).click();
    await expect(tool.getByText(learner.email)).toBeVisible();
  }
  const audited = await withAdminDb((db) =>
    db.collection('audit_log').countDocuments({ action: 'watermark_trace' }),
  );
  expect(audited).toBeGreaterThanOrEqual(2);

  // An editor and a learner are shown "not found".
  const editorPage = await adminPage(browser, editor);
  expect((await editorPage.goto(ROUTES.watermarkTrace))?.status()).toBe(404);
  expect((await page.goto(ROUTES.watermarkTrace))?.status()).toBe(404);
  await Promise.all([tool.context().close(), editorPage.context().close()]);
});
