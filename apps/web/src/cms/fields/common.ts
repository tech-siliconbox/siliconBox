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

/** The author's markup for a question, an option or an explanation, shown as written. */
export const markupField = (name: string, required = true): Field => ({
  name,
  type: 'code',
  required,
  admin: { language: 'html' },
});

/** The module a document belongs to (a Drill, an assessment, a capstone). */
export const moduleField: Field = {
  name: 'module',
  type: 'relationship',
  relationTo: 'modules',
  required: true,
  index: true,
};

/** What a learner needs to pass graded course work (ADR 0029). */
export const passMarkField = (description: string): Field => ({
  name: 'passMark',
  type: 'number',
  required: true,
  min: 1,
  admin: { description },
});
