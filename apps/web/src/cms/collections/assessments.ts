import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { markupField, moduleField, passMarkField, titleField } from '../fields/common';
import { publicIdField } from '../fields/public-id';
import { slugField } from '../fields/slug';

/**
 * A course's graded assessment (ADR 0029): the questions learners answer in the module's page.
 * The answer key is a separate document in assessment_keys, which the site never reads.
 */
export const Assessments: CollectionConfig = {
  slug: 'assessments',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'module', 'passMark', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 20 },
  fields: [
    titleField,
    slugField,
    moduleField,
    passMarkField('Correct answers needed to pass.'),
    {
      name: 'questions',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'topic', type: 'text', maxLength: 200 },
        markupField('html'),
        {
          name: 'options',
          type: 'array',
          required: true,
          minRows: 2,
          maxRows: 6,
          admin: { description: 'In order: the first is A.' },
          fields: [markupField('html')],
        },
      ],
    },
    publicIdField,
  ],
};
