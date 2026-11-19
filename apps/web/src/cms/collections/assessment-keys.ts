import { OPTION_LETTERS } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { markupField } from '../fields/common';

/**
 * An assessment's answer key (ADR 0029). Never sent to learners: the site's database user cannot
 * read this collection; only the grader user does, to score attempts and show the review.
 */
export const AssessmentKeys: CollectionConfig = {
  slug: 'assessment_keys',
  labels: { singular: 'Assessment (answer key)', plural: 'Assessments (answer keys)' },
  admin: { useAsTitle: 'assessment', defaultColumns: ['assessment', 'updatedAt'] },
  access: contentAccess,
  fields: [
    {
      name: 'assessment',
      type: 'relationship',
      relationTo: 'assessments',
      required: true,
      unique: true,
    },
    {
      name: 'answers',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { description: 'One line per question, in the same order.' },
      fields: [
        {
          name: 'correct',
          type: 'select',
          required: true,
          options: OPTION_LETTERS.map((letter) => ({ label: letter, value: letter })),
        },
        markupField('why', false),
      ],
    },
  ],
};
