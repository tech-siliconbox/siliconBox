import { describe, expect, it } from 'vitest';
import { questionsHref } from './questions-href';

describe('questionsHref', () => {
  it.each([
    [{}, '/questions'],
    [{ page: 1 }, '/questions'],
    [{ q: 'fifo depth', page: 2 }, '/questions?q=fifo+depth&page=2'],
    [{ topic: 'SVA', company: 'example-semi' }, '/questions?topic=SVA&company=example-semi'],
  ])('%o links to %s', (query, href) => {
    expect(questionsHref(query)).toBe(href);
  });
});
