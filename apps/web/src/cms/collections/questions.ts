import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { publicIdField } from '../fields/public-id';

const THIS_YEAR = new Date().getFullYear();

/** Public interview questions. The answer lives apart, in `answers` (docs/product/question-bank.md). */
export const Questions: CollectionConfig = {
  slug: 'questions',
  admin: { useAsTitle: 'text', defaultColumns: ['text', 'topics', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 50 },
  fields: [
    { name: 'text', type: 'textarea', required: true, maxLength: 2000 },
    {
      name: 'topics',
      type: 'text',
      hasMany: true,
      maxRows: 8,
      admin: { description: 'For example: SVA, liveness, AXI.' },
    },
    {
      name: 'companyTags',
      type: 'array',
      admin: {
        description: 'Tag only what you can stand behind: each tag needs a year and a source note.',
      },
      fields: [
        { name: 'company', type: 'relationship', relationTo: 'companies', required: true },
        { name: 'year', type: 'number', required: true, min: 1990, max: THIS_YEAR },
        { name: 'sourceNote', type: 'text', required: true, maxLength: 300 },
      ],
    },
    publicIdField,
  ],
};
