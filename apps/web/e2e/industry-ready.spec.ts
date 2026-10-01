import { ROUTES } from '@siliconbox/shared';
import { expect, failOnCspViolation, test } from './helpers';

test('Industry Ready lists every service, each locked until it works', async ({
  page,
  request,
}) => {
  failOnCspViolation(page);
  await page.goto(ROUTES.industryReady);
  for (const title of ['Resume Builder', 'CV screening', 'Interview prep', 'Mock interview']) {
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
  }
  await expect(page.getByText('Locked').first()).toBeVisible();

  const response = await request.get('/api/v1/services');
  const { services } = (await response.json()) as { services: { slug: string; status: string }[] };
  expect(services.map((service) => service.slug)).toEqual(
    expect.arrayContaining([
      'resume-builder',
      'cv-screening',
      'interview-prep',
      'coaching',
      'mock-interview',
    ]),
  );
});
