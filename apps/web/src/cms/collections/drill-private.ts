import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';

/**
 * The private half of a Drill. Never sent to learners: the learner-facing database user cannot
 * read this collection, and only the solver's runner will use it (phase 3).
 * Publish gate (phase 3): the reference solution must PASS and every variant must FAIL.
 */
export const DrillPrivate: CollectionConfig = {
  slug: 'drill_private',
  labels: { singular: 'Drill (private part)', plural: 'Drills (private parts)' },
  admin: { useAsTitle: 'drill', defaultColumns: ['drill', 'updatedAt'] },
  access: contentAccess,
  fields: [
    { name: 'drill', type: 'relationship', relationTo: 'drills', required: true, unique: true },
    {
      name: 'referenceSolution',
      type: 'code',
      required: true,
      admin: { language: 'systemverilog' },
    },
    { name: 'hiddenProperties', type: 'code', admin: { language: 'systemverilog' } },
    {
      name: 'bugVariants',
      type: 'array',
      required: true,
      minRows: 1,
      admin: { description: 'Each seeded bug must FAIL on the real solver.' },
      fields: [
        { name: 'name', type: 'text', required: true, maxLength: 80 },
        { name: 'code', type: 'code', required: true, admin: { language: 'systemverilog' } },
        { name: 'note', type: 'text', maxLength: 300 },
      ],
    },
  ],
};
