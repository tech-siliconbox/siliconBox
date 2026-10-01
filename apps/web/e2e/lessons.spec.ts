import { readFileSync } from 'node:fs';
import { ROUTES } from '@siliconbox/shared';
import type { Page } from '@playwright/test';
import {
  EVERY_OTHER_BLOCK,
  createDoc,
  grantContent,
  paragraph,
  signInAsAdmin,
} from './cms/publish';
import { withAdminDb } from './db';
import { expect, failOnCspViolation, newLearner, signUp, test } from './helpers';

// Phase 2 gate: an editor publishes a lesson and a learner reads it, watermarked.
const run = crypto.randomUUID().slice(0, 8);
// Learners' copies carry an invisible mark after the first word, so assertions look for the
// rest of each passage (a check on the whole string would pass even if the text leaked).
const PAID = `paid paragraph ${run}.`;
const PREVIEW = `preview paragraph ${run}.`;
const DRAFT = `unpublished draft ${run}.`;
const passage = (rest: string) => `Invented ${rest}`;
const INVISIBLE_MARK = /\u2063[\u200B\u200C]{32}\u2063/;

test.describe.configure({ mode: 'serial' });

let paidLessonId = '';
let previewLessonId = '';
let paidLessonDbId = '';

test('an author cannot publish, an editor can', async () => {
  // Editor first: on an empty CMS the first admin becomes the owner, and the author must not.
  const editor = await signInAsAdmin('editor');
  const author = await signInAsAdmin('author');

  const course = await createDoc(editor, 'courses', {
    title: `Invented course ${run}`,
    slug: `e2e-course-${run}`,
    level: 'basic',
    order: 1,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented module',
    slug: `e2e-module-${run}`,
    course: course.id,
    order: 1,
  });
  const lesson = (slug: string, text: string, preview: boolean) => ({
    title: `Invented ${slug}`,
    slug: `e2e-${slug}-${run}`,
    module: module.id,
    order: preview ? 1 : 2,
    preview,
    blocks: [paragraph(text), ...EVERY_OTHER_BLOCK],
    _status: 'published',
  });

  expect((await createDoc(author, 'lessons', lesson('by-author', 'x', false))).status).toBe(403);
  const paid = await createDoc(editor, 'lessons', lesson('paid', passage(PAID), false));
  const preview = await createDoc(editor, 'lessons', lesson('preview', passage(PREVIEW), true));
  expect([paid.status, preview.status]).toEqual([201, 201]);
  paidLessonId = paid.publicId;
  paidLessonDbId = paid.id;
  previewLessonId = preview.publicId;

  // A later draft must stay invisible to learners until it is published.
  const draft = await editor.patch(`/cms-api/lessons/${paidLessonDbId}?draft=true`, {
    data: { blocks: [paragraph(passage(DRAFT))], _status: 'draft' },
  });
  expect(draft.ok()).toBe(true);
});

test('the public outline lists lesson titles but no lesson text', async ({ page }) => {
  failOnCspViolation(page);
  await page.goto(ROUTES.course(`e2e-course-${run}`));
  await expect(page.getByRole('link', { name: 'Invented paid' })).toBeVisible();
  await expect(page.getByText('Free preview')).toBeVisible();
  expect(await page.content()).not.toContain(PAID);
});

test('a learner reads the preview, is refused the paid lesson, then reads it once entitled', async ({
  page,
}) => {
  failOnCspViolation(page);
  const learner = newLearner();
  await signUp(page, learner);

  await page.goto(ROUTES.lesson(previewLessonId));
  await expect(page.getByText(PREVIEW)).toBeVisible();

  await page.goto(ROUTES.lesson(paidLessonId));
  await expect(page.getByText('This lesson is locked')).toBeVisible();
  expect(await page.content()).not.toContain(PAID);
  await expectNoPaidTextInScripts(page);

  // Only Support (or the Owner) may grant access, and every grant is audited.
  const author = await signInAsAdmin('author');
  expect((await grantContent(author, learner.email)).status()).toBe(403);
  const support = await signInAsAdmin('support');
  expect((await grantContent(support, learner.email)).status()).toBe(201);
  const me = (await (await page.request.get('/api/v1/me')).json()) as { id: string };
  const audited = await withAdminDb((db) =>
    db.collection('audit_log').countDocuments({ action: 'entitlement_change', subjectId: me.id }),
  );
  expect(audited).toBe(1);
  const response = await page.goto(ROUTES.lesson(paidLessonId));
  expect(response?.headers()['cache-control']).toContain('no-store');

  const text = page.getByText(PAID);
  await expect(text).toBeVisible();
  expect(await text.textContent()).toMatch(INVISIBLE_MARK);
  await expect(page.locator('[data-watermark] text')).toContainText('lea…@example.test');
  await expect(page.getByText(DRAFT)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Invented heading' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Invented diagram' })).toBeVisible();
  expect(await page.content()).not.toContain('onload');

  // Progress: mark done here, see it on the outline.
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('button', { name: '✓ Done' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto(ROUTES.course(`e2e-course-${run}`));
  await expect(page.getByRole('link', { name: 'Invented paid (done)' })).toBeVisible();

  const api = await page.request.get(`/api/v1/lessons/${paidLessonId}`);
  expect(api.status()).toBe(200);
  expect(api.headers()['cache-control']).toBe('private, no-store');
  expect(JSON.stringify(await api.json())).toMatch(INVISIBLE_MARK);
});

async function expectNoPaidTextInScripts(page: Page): Promise<void> {
  const sources = await page
    .locator('script[src]')
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
  expect(sources.length).toBeGreaterThan(0);
  for (const source of sources) {
    expect(await (await page.request.get(source)).text()).not.toContain(PAID);
  }
}

test('no lesson, API or member page is prerendered at build time', () => {
  const manifest = JSON.parse(readFileSync('.next/prerender-manifest.json', 'utf8')) as {
    routes: Record<string, unknown>;
  };
  const prerendered = Object.keys(manifest.routes);
  expect(
    prerendered.filter((route) => /^\/(learn|api|account|courses|questions)/.test(route)),
  ).toEqual([]);
});

test('progress is refused without a session and for an unknown lesson', async ({
  page,
  request,
}) => {
  const body = { lessonId: crypto.randomUUID(), done: true };
  const origin = { origin: 'http://localhost:3000' };
  expect((await request.post('/api/v1/progress', { data: body, headers: origin })).status()).toBe(
    401,
  );
  await signUp(page, newLearner());
  const unknown = await page.request.post('/api/v1/progress', { data: body, headers: origin });
  expect(unknown.status()).toBe(404);
});

test('a grant for an email nobody signed up with is refused', async () => {
  const support = await signInAsAdmin('support');
  const response = await grantContent(support, newLearner().email);
  expect(response.status()).toBe(400);
});
