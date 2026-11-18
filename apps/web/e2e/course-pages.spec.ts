import { ROUTES } from '@siliconbox/shared';
import type { APIRequestContext } from '@playwright/test';
import { createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, newLearner, signUp, test } from './helpers';

// ADR 0024: an author's module page is shown whole, in the site's design, with the lab's Drill
// in the page. Invented markup in the shape of a course page; no real course text.
const run = crypto.randomUUID().slice(0, 8);
const COURSE = `e2e-pages-course-${run}`;
const LESSON = `e2e-pages-lesson-${run}`;
const DRILL = `e2e-pages-drill-${run}`;
const DRILL_TITLE = `Invented page Drill ${run}`;
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

async function publishCoursePage(editor: APIRequestContext): Promise<string> {
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
  return lesson.publicId;
}

test('a module page is whole, in the site design, with its Drill after the lab', async ({
  page,
}) => {
  const lessonId = await publishCoursePage(await signInAsAdmin('editor'));
  failOnCspViolation(page);

  // The public course page is the author's home page, linking to the module's page.
  await page.goto(ROUTES.course(COURSE));
  await expect(page.getByRole('link', { name: 'Invented module' })).toHaveAttribute(
    'href',
    ROUTES.lesson(lessonId),
  );

  const learner = newLearner();
  await signUp(page, learner);
  const support = await signInAsAdmin('support');
  await grantAccess(support, learner.email);
  await grantAccess(support, learner.email, 'tool');
  await page.goto(ROUTES.lesson(lessonId));

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
  await expect(page.getByRole('link', { name: 'Course home' })).toHaveAttribute(
    'href',
    ROUTES.course(COURSE),
  );
});
