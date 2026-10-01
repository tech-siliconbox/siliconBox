import { type QuestionQuery, ROUTES } from '@siliconbox/shared';

/** Link to the question bank with these filters; empty values are left out. */
export function questionsHref(query: Partial<QuestionQuery>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && !(key === 'page' && value === 1)) params.set(key, String(value));
  }
  const search = params.toString();
  return search === '' ? ROUTES.questions : `${ROUTES.questions}?${search}`;
}
