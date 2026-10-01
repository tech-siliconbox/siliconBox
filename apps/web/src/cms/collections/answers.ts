import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { LESSON_BLOCKS } from './lesson-blocks';

/**
 * Paid answers, one per question, kept apart from the public question text. The learner-facing
 * database user cannot read this collection (infra/mongodb/create-app-role.js).
 */
export const Answers: CollectionConfig = {
  slug: 'answers',
  admin: { useAsTitle: 'question', defaultColumns: ['question', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    {
      name: 'question',
      type: 'relationship',
      relationTo: 'questions',
      required: true,
      unique: true,
    },
    { name: 'blocks', type: 'blocks', required: true, minRows: 1, blocks: LESSON_BLOCKS },
  ],
};
