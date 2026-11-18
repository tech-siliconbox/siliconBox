import { describe, expect, it } from 'vitest';
import { SLUG_PATTERN } from './schemas/lesson';
import { slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['4.4 Open-source setup: SymbiYosys', '4-4-open-source-setup-symbiyosys'],
    ['Assume–Guarantee Basics', 'assume-guarantee-basics'],
    ['  What does `a |-> b` mean?  ', 'what-does-a-b-mean'],
    ['Café déjà vu', 'cafe-deja-vu'],
  ])('%s', (text, slug) => {
    expect(slugify(text)).toBe(slug);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it('cuts long text at a word boundary-safe length with no trailing hyphen', () => {
    const slug = slugify('word '.repeat(40), 22);
    expect(slug.length).toBeLessThanOrEqual(22);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});
