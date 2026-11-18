import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';

/**
 * The private half of a Drill. Never sent to learners: the learner-facing database user cannot
 * read this collection, and only the solver's runner will use it (phase 3).
 * Publish gate (`pnpm drills:verify`): the reference solution gives the Drill's target on its
 * design, PASSes on the reference design and FAILs on every bug variant.
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
    {
      name: 'referenceDesign',
      type: 'code',
      admin: {
        language: 'systemverilog',
        description:
          'The correct design, when learners are shown a buggy one: the reference solution must PASS on it.',
      },
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
