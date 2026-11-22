import { ROUTES } from '@siliconbox/shared';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, newLearner, signUp, test } from './helpers';

// ADR 0024: an author's module page is shown whole, in the site's design, with the lab's Drill
// in the page. Invented markup in the shape of a course page; no real course text.
const run = crypto.randomUUID().slice(0, 8);
const COURSE = `e2e-pages-course-${run}`;
const LESSON = `e2e-pages-lesson-${run}`;
const DRILL = `e2e-pages-drill-${run}`;
const DRILL_TITLE = `Invented page Drill ${run}`;
// Readable addresses (ADR 0026): course, lesson and Drill slugs, never an id.
const LESSON_PAGE = ROUTES.lesson(COURSE, LESSON);
// Learners' copies carry an invisible mark after the first word of each passage.
const WARNING = `Invented warning ${run}.`;

const PAGE = `<span class="module-tag">Basic · Module 1 of 1</span><h1>Invented Module ${run}</h1>
<p class="lead">Invented lead.</p>
<div class="callout warn"><span class="title">Careful</span>${WARNING}</div>
<table><thead><tr><th>Invented</th><th>Other</th></tr></thead>
<tbody><tr><td>cell</td><td>cell</td></tr></tbody></table>
<pre><code>assert property (p);  <span class="c">// invented</span></code></pre>
<div class="wave"><pre>clk : _|-|_|-|_</pre></div>
<script>window.authorScriptRan = true;</script>
<div class="lab"><h2>Lab 1: Invented lab</h2><ol><li>Invented step.</li></ol></div>`;
const AFTER_LAB = `<div class="nav-bar"><a href="course:${COURSE}">Course home</a></div>`;

test.describe.configure({ mode: 'serial' });

async function publishCoursePage(editor: APIRequestContext): Promise<void> {
  const course = await createDoc(editor, 'courses', {
    title: `Invented page course ${run}`,
    slug: COURSE,
    level: 'basic',
    order: 1,
    introduction: `<h1>Invented page course ${run}</h1><ol class="module-list"><li><a href="lesson:${LESSON}"><strong>Invented module</strong></a></li></ol>`,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented module',
    slug: `e2e-pages-module-${run}`,
    course: course.id,
    order: 1,
  });
  const drill = await createDoc(editor, 'drills', {
    title: DRILL_TITLE,
    slug: DRILL,
    module: module.id,
    order: 1,
    mode: 'bmc',
    solver: 'boolector',
    target: 'PASS',
    depth: 10,
    timeoutSeconds: 30,
    topModule: 'invented',
    brief: [paragraph('Invented brief.'), { blockType: 'callout', tone: 'tip', text: 'Invented.' }],
    designCode: 'module invented(input logic clk); endmodule',
    starterCode: 'module invented_props(input logic clk); endmodule',
    _status: 'published',
  });
  const lesson = await createDoc(editor, 'lessons', {
    title: 'Module 1: Invented Module',
    slug: LESSON,
    module: module.id,
    order: 1,
    blocks: [
      { blockType: 'html', html: PAGE },
      { blockType: 'drillEmbed', drill: DRILL },
      { blockType: 'html', html: AFTER_LAB },
    ],
    _status: 'published',
  });
  expect([course.status, drill.status, lesson.status]).toEqual([201, 201, 201]);
}

test('a module page is whole, in the site design, with its Drill after the lab', async ({
  page,
}) => {
  await publishCoursePage(await signInAsAdmin('editor'));
  failOnCspViolation(page);

  // The public course page is the author's home page, linking to the module's page.
  await page.goto(ROUTES.course(COURSE));
  await expect(page.getByRole('link', { name: 'Invented module' })).toHaveAttribute(
    'href',
    LESSON_PAGE,
  );

  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  await page.goto(LESSON_PAGE);

  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toContainText(`Module ${run}`);
  expect(await heading.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^Geist,/);

  // The author's colour coding, drawn with the site's tokens.
  const warning = page.locator('.course-html .callout.warn');
  await expect(warning).toContainText(`warning ${run}.`);
  expect(await warning.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    'rgb(250, 244, 226)',
  );

  // Code is copyable, text-drawn waveforms are not; tables scroll in their frame.
  await expect(page.getByRole('button', { name: 'Copy code' })).toHaveCount(1);
  await expect(page.locator('.course-html pre').first()).toHaveCSS('font-family', /^"Geist Mono"/);
  await expect(page.locator('.course-html .table-frame table')).toHaveCount(1);

  // The author's script was removed, not run.
  expect(await page.evaluate(() => 'authorScriptRan' in window)).toBe(false);

  // The Drill follows the lab, with the tool.
  const practice = page.getByRole('region', { name: `Practice: ${DRILL_TITLE}` });
  await expect(practice).toBeVisible();
  await expect(practice.getByRole('button', { name: 'Run verification' })).toBeVisible();
  await expect(practice.locator('.callout-box[data-tone="tip"]')).toBeVisible();
  await expect(practice.getByRole('link', { name: 'Open full screen →' })).toHaveAttribute(
    'href',
    ROUTES.drill(COURSE, DRILL),
  );
  await expect(page.getByRole('link', { name: 'Course home' })).toHaveAttribute(
    'href',
    ROUTES.course(COURSE),
  );

  await expectModuleIndexAndPhoneLayout(page, practice);
});

test('the golden rule: content comes only with its page, and AI crawlers get no page', async ({
  page,
  request,
}) => {
  const learner = newLearner();
  await signUp(page, learner);
  await grantAccess(await signInAsAdmin('support'), learner.email);
  const fetched: string[] = [];
  page.on('request', (sent) => {
    if (['fetch', 'xhr'].includes(sent.resourceType())) fetched.push(new URL(sent.url()).pathname);
  });
  await page.goto(LESSON_PAGE);
  await page.getByRole('navigation', { name: 'Course modules' }).hover();
  await page.waitForTimeout(1500);
  // No prefetch of other pages, no API call: the page arrived with everything it shows.
  expect(fetched).toEqual([]);

  const crawler = {
    'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  };
  expect((await request.get(ROUTES.course(COURSE), { headers: crawler })).status()).toBe(403);
  const robots = await (await request.get('/robots.txt', { headers: crawler })).text();
  expect(robots).toContain('User-Agent: GPTBot');
});

/** The module index beside the page, the done mark, and the phone layout. */
async function expectModuleIndexAndPhoneLayout(page: Page, practice: Locator): Promise<void> {
  // The module index beside the page: this module is open on its parts, theory and lab marked,
  // and marking it done ticks it.
  const index = page.getByRole('navigation', { name: 'Course modules' });
  await expect(index.getByRole('link', { name: 'Overview' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const lab = index.getByRole('link', { name: /Lab 1: Invented lab/ });
  await expect(lab).toHaveAttribute('href', `${LESSON_PAGE}#section-lab-1-invented-lab`);
  await expect(lab).toContainText('Tool');
  await page.getByRole('button', { name: 'Mark as done' }).click();
  // Saved first, then the page refreshes to show the tick in the index.
  await expect(page.getByRole('button', { name: '✓ Done' })).toBeVisible();
  await expect(index.locator('summary')).toContainText('(done)', { timeout: 10_000 });
  await expect(index).toContainText('1 of 1 modules done');

  // On a phone the index folds out above the page, and the Drill's Run button stays on screen.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('All modules')).toBeVisible();
  const runButton = await practice.getByRole('button', { name: 'Run verification' }).boundingBox();
  expect((runButton?.x ?? Infinity) + (runButton?.width ?? 0)).toBeLessThanOrEqual(390);
}

const SOON = `e2e-soon-course-${run}`;
const SOON_LESSON = `e2e-soon-lesson-${run}`;

/** An Advance course still being written, with a published module page. */
async function publishComingSoonCourse(editor: APIRequestContext) {
  const course = await createDoc(editor, 'courses', {
    title: `Invented coming course ${run}`,
    slug: SOON,
    level: 'advance',
    availability: 'comingSoon',
    order: 3,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: `Invented coming module ${run}`,
    slug: `e2e-soon-module-${run}`,
    course: course.id,
    order: 1,
  });
  const lesson = await createDoc(editor, 'lessons', {
    title: `Invented coming lesson ${run}`,
    slug: SOON_LESSON,
    module: module.id,
    order: 1,
    preview: true,
    blocks: [paragraph('Invented text of a course not open yet.')],
    _status: 'published',
  });
  expect([course.status, module.status, lesson.status]).toEqual([201, 201, 201]);
}

test('a course coming soon says so, shows no outline and serves none of its pages', async ({
  page,
}) => {
  await publishComingSoonCourse(await signInAsAdmin('editor'));
  failOnCspViolation(page);

  // The catalogue and the course page say it is coming; its modules are not listed.
  await page.goto(ROUTES.courses);
  const card = page.getByRole('link', { name: new RegExp(`Invented coming course ${run}`) });
  await expect(card).toContainText('Coming soon');
  await page.goto(ROUTES.course(SOON));
  await expect(page.getByRole('heading', { name: 'This course is coming soon' })).toBeVisible();
  await expect(page.getByText(`Invented coming module ${run}`)).toHaveCount(0);
  // Pricing shows the level as coming, not for sale.
  await page.goto('/pricing');
  await expect(page.getByText('this level can be bought when it opens')).toBeVisible();

  // Even a learner with the level's access is not served its pages.
  const learner = newLearner();
  await signUp(page, learner);
  await grantAccess(await signInAsAdmin('support'), learner.email, 'content', 'advance');
  const lessonPage = await page.goto(ROUTES.lesson(SOON, SOON_LESSON));
  expect(lessonPage?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Invented text of a course not open yet.')).toHaveCount(0);
});
