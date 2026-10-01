import { SLUG_PATTERN } from '@siliconbox/shared';
import type { Field } from 'payload';

export const slugField: Field = {
  name: 'slug',
  type: 'text',
  required: true,
  unique: true,
  index: true,
  validate: (value: unknown) =>
    typeof value === 'string' && SLUG_PATTERN.test(value)
      ? true
      : 'Use lowercase words joined by hyphens.',
};
