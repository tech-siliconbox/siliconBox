import { describe, expect, it } from 'vitest';
import { JOB_DESCRIPTION_MAX_CHARS, ScreeningOptionsSchema, screeningOptions } from './report';

describe('ScreeningOptionsSchema', () => {
  it('accepts no options, or a trimmed job description', () => {
    expect(ScreeningOptionsSchema.parse({})).toEqual({});
    expect(ScreeningOptionsSchema.parse({ jobDescription: '  UVM role \n' })).toEqual({
      jobDescription: 'UVM role',
    });
  });

  it.each([
    ['a blank job description', { jobDescription: '   ' }],
    ['one that is too long', { jobDescription: 'x'.repeat(JOB_DESCRIPTION_MAX_CHARS + 1) }],
    ['an unknown field', { jobDescription: 'UVM role', fileUrl: 'https://example.test' }],
  ])('refuses %s', (_label, input) => {
    expect(ScreeningOptionsSchema.safeParse(input).success).toBe(false);
  });
});

describe('screeningOptions', () => {
  it('leaves a blank box out and trims a filled one', () => {
    expect(screeningOptions(' \n ')).toEqual({});
    expect(screeningOptions(' SVA ')).toEqual({ jobDescription: 'SVA' });
  });
});
