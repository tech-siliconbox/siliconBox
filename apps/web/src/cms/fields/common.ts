import type { Field } from 'payload';

export const titleField: Field = { name: 'title', type: 'text', required: true, maxLength: 200 };

/** Position among siblings; lists sort by it. */
export const orderField: Field = {
  name: 'order',
  type: 'number',
  required: true,
  defaultValue: 1,
  min: 1,
};
