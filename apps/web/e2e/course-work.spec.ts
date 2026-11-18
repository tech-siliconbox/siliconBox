import { API_ROUTES, ROUTES } from '@siliconbox/shared';
import type { APIRequestContext, Page } from '@playwright/test';
import { BASE_URL } from './base-url';
import { adminPage, createDoc, grantAccess, paragraph, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, newLearner, signUp, test } from './helpers';

// Graded course work (ADR 0029): an assessment answered in the page and scored on the server,
// and a capstone uploaded, graded by an expert and shown back with feedback. Invented text only.
const run = crypto.randomUUID().slice(0, 8);
const COURSE = `e2e-work-course-${run}`;
const LESSON = `e2e-work-lesson-${run}`;
const WHY = `Invented explanation ${run}`;
const FEEDBACK = `Invented feedback ${run}: tighten the assumptions.`;
// The smallest valid .zip: an empty archive.
const EMPTY_ZIP = Buffer.from([0x50, 0x4b, 0x05, 0x06, ...new Array<number>(18).fill(0)]);

test.describe.configure({ mode: 'serial' });

/** The assessment and its key, in the module; returns the assessment's public id. */
async function publishAssessment(editor: APIRequestContext, moduleId: string): Promise<string> {
  const option = (html: string) => ({ html });
  const assessment = await createDoc(editor, 'assessments', {
    title: 'Invented assessment',
    slug: `e2e-work-assessment-${run}`,
    module: moduleId,
    passMark: 2,
    questions: [
      {
        topic: 'Invented topic',
        html: 'Which is right?',
        options: [option('Left'), option('Right')],
      },
      { html: 'And now?', options: [option('Yes'), option('No')] },
    ],
    _status: 'published',
  });
  const key = await createDoc(editor, 'assessment_keys', {
    assessment: assessment.id,
    answers: [{ correct: 'B', why: WHY }, { correct: 'A' }],
  });
  expect([assessment.status, key.status]).toEqual([201, 201]);
  return assessment.publicId;
}

/** A course whose one lesson holds a capstone and an assessment; returns the assessment's id. */
async function publishCourseWork(editor: APIRequestContext): Promise<string> {
  const course = await createDoc(editor, 'courses', {
    title: `Invented work course ${run}`,
    slug: COURSE,
    level: 'basic',
    order: 1,
    _status: 'published',
  });
  const module = await createDoc(editor, 'modules', {
    title: 'Invented final module',
    slug: `e2e-work-module-${run}`,
    course: course.id,
    order: 1,
  });
  const assessmentId = await publishAssessment(editor, module.id);
  const capstone = await createDoc(editor, 'capstones', {
    title: 'Invented capstone',
    slug: `e2e-work-capstone-${run}`,
    module: module.id,
    passMark: 70,
    rubric: [
      { criterion: 'Plan', points: 40 },
      { criterion: 'Report', points: 60 },
    ],
    _status: 'published',
  });
  const lesson = await createDoc(editor, 'lessons', {
    title: 'Invented final lesson',
    slug: LESSON,
    module: module.id,
    order: 1,
    blocks: [
      paragraph('Invented text.'),
      { blockType: 'capstoneEmbed', capstone: `e2e-work-capstone-${run}` },
      { blockType: 'assessmentEmbed', assessment: `e2e-work-assessment-${run}` },
    ],
    _status: 'published',
  });
  expect([capstone.status, lesson.status]).toEqual([201, 201]);
  return assessmentId;
}

/** Picks one option per question (by its text) and submits the attempt. */
async function attempt(page: Page, answers: string[]): Promise<void> {
  const region = page.getByRole('region', { name: 'Assessment: Invented assessment' });
  for (const [index, answer] of answers.entries()) {
    await region.getByRole('group').nth(index).getByLabel(answer).check();
  }
  await region.getByRole('button', { name: /^Submit attempt/ }).click();
}

const status = (page: Page) =>
  page.getByRole('region', { name: 'Assessment: Invented assessment' }).getByRole('status');

let learnerPage: Page;
let assessmentId: string;

test('an assessment is scored on the server; the key shows only once it is finished', async ({
  browser,
  request,
}) => {
  test.setTimeout(90_000);
  const editor = await signInAsAdmin('editor');
  assessmentId = await publishCourseWork(editor);
  // From our own origin but without a session: refused as signed out.
  const signedOut = await request.post(API_ROUTES.assessmentAttempts(assessmentId), {
    data: { answers: [1, 0] },
    headers: { origin: BASE_URL },
  });
  expect(signedOut.status()).toBe(401);

  learnerPage = await (await browser.newContext()).newPage();
  failOnCspViolation(learnerPage);
  const learner = newLearner();
  await signUp(learnerPage, learner);
  await grantAccess(await signInAsAdmin('support'), learner.email);
  await learnerPage.goto(ROUTES.lesson(COURSE, LESSON));
  await expect(status(learnerPage)).toContainText(
    '2 questions. Pass with 2. 3 of 3 attempts left.',
  );
  // Golden rule and ADR 0029: the page carries no key and no explanation before the end.
  expect(await learnerPage.content()).not.toContain(WHY);

  await attempt(learnerPage, ['Left', 'Yes']);
  await expect(status(learnerPage)).toContainText(
    'Last attempt: 1 of 2. 2 questions. Pass with 2. 2 of 3',
  );
  expect(await learnerPage.content()).not.toContain(WHY);

  await attempt(learnerPage, ['Right', 'Yes']);
  await expect(status(learnerPage)).toContainText('You passed with 2 of 2.');
  await expect(learnerPage.getByText(WHY)).toBeVisible();
  await expect(learnerPage.getByText('✓ correct').first()).toBeVisible();

  // Finished: another attempt is refused, whatever the browser sends.
  const again = await learnerPage.request.post(API_ROUTES.assessmentAttempts(assessmentId), {
    data: { answers: [1, 0] },
    headers: { origin: BASE_URL },
  });
  expect(again.status()).toBe(409);
});

test('a capstone is uploaded, graded by an expert, and shown back with feedback', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const page = learnerPage;
  await page.goto(ROUTES.lesson(COURSE, LESSON));
  const capstone = page.getByRole('region', { name: 'Capstone: Invented capstone' });
  await capstone.getByLabel('Project (.zip)').setInputFiles({
    name: 'notes.txt',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a zip'),
  });
  await capstone.getByRole('button', { name: 'Submit your project' }).click();
  await expect(capstone.getByRole('alert')).toContainText('Upload your project as one .zip');
  await capstone.getByLabel('Project (.zip)').setInputFiles({
    name: 'project.zip',
    mimeType: 'application/zip',
    buffer: EMPTY_ZIP,
  });
  await capstone.getByRole('button', { name: 'Submit your project' }).click();
  await expect(capstone).toContainText('Submitted: project.zip');

  // An Editor grades it in the admin tool.
  const expert = await adminPage(browser, await signInAsAdmin('editor'));
  await expert.goto(ROUTES.capstoneReviews);
  await expert
    .getByRole('row', { name: /Invented capstone/ })
    .getByRole('link', { name: 'Review' })
    .click();
  await expert.getByLabel('Plan (out of 40)').fill('35');
  await expert.getByLabel('Report (out of 60)').fill('45');
  await expert.getByLabel('Feedback for the learner').fill(FEEDBACK);
  await expert.getByRole('button', { name: 'Save grade' }).click();
  await expect(expert).toHaveURL(ROUTES.capstoneReviews);

  await page.reload();
  await expect(capstone).toContainText('Passed: 80 of 100');
  await expect(capstone).toContainText(FEEDBACK);
  await expect(capstone.getByRole('button', { name: /Submit/ })).toHaveCount(0);

  await page.goto(ROUTES.performance);
  const result = page.getByRole('region', { name: `Invented work course ${run}` });
  await expect(result).toContainText('Course passed');
  await expect(result).toContainText('Passed: 2 of 2');
  await expect(result).toContainText('Passed: 80 of 100');
});

test('learners and other admins cannot open the grading tool', async ({ page }) => {
  await signUp(page, newLearner());
  const response = await page.goto(ROUTES.capstoneReviews);
  expect(response?.status()).toBe(404);
});
