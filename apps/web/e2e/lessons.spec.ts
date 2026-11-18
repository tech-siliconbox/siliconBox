import { readFileSync } from 'node:fs';
import { ROUTES } from '@siliconbox/shared';
import type { Page } from '@playwright/test';
import { EVERY_OTHER_BLOCK, createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { BASE_URL } from './base-url';
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

// Readable addresses (ADR 0026): course and lesson slugs, never an id.
const COURSE = `e2e-course-${run}`;
const PAID_PAGE = ROUTES.lesson(COURSE, `e2e-paid-${run}`);
const PREVIEW_PAGE = ROUTES.lesson(COURSE, `e2e-preview-${run}`);
let paidLessonDbId = '';
let moduleDbId = '';

test('an author cannot publish, an editor can', async () => {
  // Editor first: on an empty CMS the first admin becomes the owner, and the author must not.
  const editor = await signInAsAdmin('editor');
  const author = await signInAsAdmin('author');

  const course = await createDoc(editor, 'courses', {
    title: `Invented course ${run}`,
    slug: COURSE,
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
  moduleDbId = module.id;
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
  paidLessonDbId = paid.id;

  // A later draft must stay invisible to learners until it is published.
  const draft = await editor.patch(`/cms-api/lessons/${paidLessonDbId}?draft=true`, {
    data: { blocks: [paragraph(passage(DRAFT))], _status: 'draft' },
  });
  expect(draft.ok()).toBe(true);
});

test('an editor writes a Drill within the level caps, with its private part', async () => {
  const editor = await signInAsAdmin('editor');
  const drill = (slug: string, depth: number) => ({
    title: `Invented Drill ${slug}`,
    slug: `e2e-drill-${slug}-${run}`,
    module: moduleDbId,
    order: 1,
    mode: 'prove',
    solver: 'boolector',
    target: 'PASS',
    depth,
    timeoutSeconds: 60,
    topModule: 'top',
    brief: [paragraph('Invented Drill brief.')],
    starterCode: 'module top(input clk); endmodule',
    _status: 'draft',
  });
  // The course is Basic, whose depth cap is 40.
  expect((await createDoc(editor, 'drills', drill('too-deep', 41))).status).toBe(400);
  const valid = await createDoc(editor, 'drills', drill('ok', 20));
  expect(valid.status).toBe(201);
  const hidden = await createDoc(editor, 'drill_private', {
    drill: valid.id,
    referenceSolution: 'module top(input clk); endmodule',
    bugVariants: [{ name: 'off by one', code: 'module top(input clk); endmodule' }],
  });
  expect(hidden.status).toBe(201);
});

test('an admin previews the latest draft; a learner cannot', async ({ page }) => {
  const editor = await signInAsAdmin('editor');
  await page.context().addCookies((await editor.storageState()).cookies);
  await page.goto(ROUTES.lessonPreview(`e2e-paid-${run}`));
  await expect(
    page.getByRole('status').filter({ hasText: 'Preview of the latest draft' }),
  ).toBeVisible();
  await expect(page.getByText(DRAFT)).toBeVisible();

  await page.context().clearCookies();
  await signUp(page, newLearner());
  const response = await page.goto(ROUTES.lessonPreview(`e2e-paid-${run}`));
  expect(response?.status()).toBe(404);
  expect(await page.content()).not.toContain(DRAFT);
});

test('the public outline lists lesson titles but no lesson text', async ({ page }) => {
  failOnCspViolation(page);
  await page.goto(ROUTES.course(COURSE));
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

  await page.goto(PREVIEW_PAGE);
  await expect(page.getByText(PREVIEW)).toBeVisible();

  await page.goto(PAID_PAGE);
  await expect(page.getByText('This lesson is locked')).toBeVisible();
  expect(await page.content()).not.toContain(PAID);
  await expectNoPaidTextInScripts(page);

  // Only Support (or the Owner) may grant access, and every grant is audited.
  const author = await signInAsAdmin('author');
  expect((await grantAccess(author, learner.email)).status()).toBe(403);
  const support = await signInAsAdmin('support');
  expect((await grantAccess(support, learner.email)).status()).toBe(201);
  const me = (await (await page.request.get('/api/v1/me')).json()) as { id: string };
  const audited = await withAdminDb((db) =>
    db.collection('audit_log').countDocuments({ action: 'entitlement_change', subjectId: me.id }),
  );
  expect(audited).toBe(1);
  const response = await page.goto(PAID_PAGE);
  expect(response?.headers()['cache-control']).toContain('no-store');

  const text = page.getByText(PAID);
  await expect(text).toBeVisible();
  expect(await text.textContent()).toMatch(INVISIBLE_MARK);
  await expect(page.locator('[data-watermark] text')).toContainText('lea…@example.test');
  await expect(page.getByText(DRAFT)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Invented heading' })).toBeVisible();
  await expectEveryBlockRenders(page);

  // Progress: mark done here, see it on the outline.
  await page.getByRole('button', { name: 'Mark as done' }).click();
  await expect(page.getByRole('button', { name: '✓ Done' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.goto(ROUTES.course(COURSE));
  await expect(page.getByRole('link', { name: 'Invented paid (done)' })).toBeVisible();

  // The golden rule: lesson text reaches the browser only inside its page, never as an API.
  expect((await page.request.get(`/api/v1/lessons/e2e-paid-${run}`)).status()).toBe(404);
});

/** The lesson fixture holds every block type (EVERY_OTHER_BLOCK); each must render and work. */
async function expectEveryBlockRenders(page: Page): Promise<void> {
  await expect(page.getByRole('img', { name: 'Invented diagram' })).toBeVisible();
  expect(await page.content()).not.toContain('onload');
  await expect(page.getByText('Invented caption.')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Invented column' })).toBeVisible();
  await page.getByText('Show answer').click();
  await expect(page.getByText('answer.')).toBeVisible();
  await page.getByText('Show invented hints').click();
  await expect(page.getByText('hint.')).toBeVisible();
  // The state graph comes from the lesson; the site only animates it.
  await page.getByRole('button', { name: 'Run formal' }).click();
  await expect(page.getByText(/shortest trace, 2 cycles\): S0 → S1 → S2/)).toBeVisible();
  await page.getByRole('button', { name: 'Run 1000 tests' }).click();
  await expect(page.getByText('Tests run: 1000')).toBeVisible();
}

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
  const origin = { origin: BASE_URL };
  expect((await request.post('/api/v1/progress', { data: body, headers: origin })).status()).toBe(
    401,
  );
  await signUp(page, newLearner());
  const unknown = await page.request.post('/api/v1/progress', { data: body, headers: origin });
  expect(unknown.status()).toBe(404);
});

test('a grant for an email nobody signed up with is refused', async () => {
  const support = await signInAsAdmin('support');
  const response = await grantAccess(support, newLearner().email);
  expect(response.status()).toBe(400);
});
