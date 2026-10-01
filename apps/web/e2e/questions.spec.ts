import { ROUTES } from '@siliconbox/shared';
import { createDoc, paragraph, signInAsAdmin } from './cms/publish';
import { expect, failOnCspViolation, test } from './helpers';

const run = crypto.randomUUID().slice(0, 8);
const PUBLISHED = `Invented question e2e-${run}: why can a passing proof be vacuous?`;
const DRAFT = `Invented question e2e-${run}: an unpublished draft`;
const ANSWER = `Invented answer ${run} that must never be public.`;
const COMPANY = { name: `Invented Semiconductors ${run}`, slug: `e2e-company-${run}` };

test.describe.configure({ mode: 'serial' });

test('an editor publishes a question with a company tag and a private answer', async () => {
  const editor = await signInAsAdmin('editor');
  const company = await createDoc(editor, 'companies', COMPANY);
  const question = await createDoc(editor, 'questions', {
    text: PUBLISHED,
    topics: ['SVA', `e2e-topic-${run}`],
    companyTags: [{ company: company.id, year: 2025, sourceNote: 'Invented source note' }],
    _status: 'published',
  });
  const draft = await createDoc(editor, 'questions', { text: DRAFT, _status: 'draft' });
  const answer = await createDoc(editor, 'answers', {
    question: question.id,
    blocks: [paragraph(ANSWER)],
    _status: 'published',
  });
  expect([company.status, question.status, draft.status, answer.status]).toEqual([
    201, 201, 201, 201,
  ]);
});

test('the public question bank shows published questions with company tags, never answers', async ({
  page,
}) => {
  failOnCspViolation(page);
  await page.goto(`${ROUTES.questions}?topic=e2e-topic-${run}`);
  await expect(page.getByText(PUBLISHED)).toBeVisible();
  await expect(page.getByText(COMPANY.name)).toBeVisible();
  await expect(page.getByText('2025')).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(DRAFT);
  expect(html).not.toContain(ANSWER);
  expect(html).not.toContain('Invented source note');

  await page.getByRole('link', { name: new RegExp(COMPANY.name) }).click();
  await expect(page).toHaveURL(new RegExp(`company=${COMPANY.slug}`));
  await expect(page.getByText(PUBLISHED)).toBeVisible();
});

test('the questions API searches by text and leaks nothing private', async ({ request }) => {
  const response = await request.get(`/api/v1/questions?q=vacuous&company=${COMPANY.slug}`);
  expect(response.status()).toBe(200);
  const body = JSON.stringify(await response.json());
  expect(body).toContain(PUBLISHED);
  expect(body).not.toContain(ANSWER);
  expect(body).not.toContain(DRAFT);
  expect((await request.get('/api/v1/questions?sort=$where')).status()).toBe(400);
});
