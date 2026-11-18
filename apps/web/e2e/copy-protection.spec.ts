import { ROUTES } from '@siliconbox/shared';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { expect, newLearner, signUp, test } from './helpers';

// ADR 0023: paid text cannot be copied or printed; code examples can.
const run = crypto.randomUUID().slice(0, 8);
const PASSAGE = `Invented copyrighted passage ${run}.`;
const CODE = `assert property (@(posedge clk) req |-> ##1 ack); // ${run}`;

/** Publishes an invented lesson and returns its page address. */
async function publishLesson(editor: APIRequestContext): Promise<string> {
  const course = await createDoc(editor, 'courses', {
    title: `Invented protected course ${run}`,
    slug: `e2e-protect-course-${run}`,
    level: 'basic',
    order: 1,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented module',
    slug: `e2e-protect-module-${run}`,
    course: course.id,
    order: 1,
  });
  const lesson = await createDoc(editor, 'lessons', {
    title: 'Invented protected lesson',
    slug: `e2e-protect-lesson-${run}`,
    module: module.id,
    order: 1,
    blocks: [paragraph(PASSAGE), { blockType: 'code', language: 'systemverilog', code: CODE }],
    _status: 'published',
  });
  expect(lesson.status).toBe(201);
  return ROUTES.lesson(`e2e-protect-course-${run}`, `e2e-protect-lesson-${run}`);
}

/** Selects everything inside `target`, then fires `type` there; true when the page blocked it. */
function blockedAfterSelecting(target: Locator, type: 'copy' | 'contextmenu'): Promise<boolean> {
  return target.evaluate((element, eventType) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    const event =
      eventType === 'copy'
        ? new ClipboardEvent('copy', { bubbles: true, cancelable: true })
        : new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, type);
}

async function openAsEntitledLearner(page: Page): Promise<void> {
  const lessonPage = await publishLesson(await signInAsAdmin('editor'));
  const learner = newLearner();
  await signUp(page, learner);
  await grantAccess(await signInAsAdmin('support'), learner.email);
  await page.goto(lessonPage);
}

test('lesson text cannot be copied, code can, and nothing prints', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAsEntitledLearner(page);
  const text = page.getByText(PASSAGE.slice(9));
  const code = page.locator('pre[data-copyable]');

  expect(await text.evaluate((element) => getComputedStyle(element).userSelect)).toBe('none');
  expect(await blockedAfterSelecting(text, 'copy')).toBe(true);
  expect(await blockedAfterSelecting(text, 'contextmenu')).toBe(true);
  await expect(page.getByText('This content is copyrighted and cannot be copied.')).toBeVisible();

  expect(await blockedAfterSelecting(code, 'copy')).toBe(false);
  await page.getByRole('button', { name: 'Copy code' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CODE);

  await page.emulateMedia({ media: 'print' });
  await expect(text).toBeHidden();
  await expect(page.getByText('Printing and saving it are not allowed.')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const veil = page.getByRole('button', { name: /Content hidden while this window/ });
  await expect(veil).toBeVisible();
  await veil.click();
  await expect(veil).toBeHidden();
});
