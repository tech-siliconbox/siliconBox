import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { markupField, moduleField, passMarkField, titleField } from '../fields/common';
import { publicIdField } from '../fields/public-id';
import { slugField } from '../fields/slug';

/** A course's capstone project (ADR 0029): the rubric experts score submissions on. */
export const Capstones: CollectionConfig = {
  slug: 'capstones',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'module', 'passMark', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 20 },
  fields: [
    titleField,
    slugField,
    moduleField,
    passMarkField('Points needed to pass.'),
    {
      name: 'rubric',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'criterion', type: 'text', required: true, maxLength: 200 },
        { name: 'points', type: 'number', required: true, min: 1, max: 100 },
        markupField('fullMarks', false),
      ],
    },
    publicIdField,
  ],
};
