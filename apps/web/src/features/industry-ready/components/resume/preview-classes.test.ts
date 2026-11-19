import { RESUME_ACCENTS, RESUME_FONT_SIZES } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { ACCENT_CLASSES, FONT_SIZE_CLASSES } from './preview-classes';

describe('preview classes', () => {
  it.each(Object.entries(RESUME_ACCENTS))('%s uses the PDF colour %s', (name, hex) => {
    const classes = ACCENT_CLASSES[name as keyof typeof RESUME_ACCENTS];
    for (const value of Object.values(classes)) expect(value).toContain(`[${hex}]`);
  });

  it('has a size for every font size', () => {
    const sizes = Object.keys(FONT_SIZE_CLASSES).map(Number);
    expect(sizes.sort((a, b) => a - b)).toEqual([...RESUME_FONT_SIZES]);
  });
});
