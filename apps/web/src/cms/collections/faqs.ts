import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { orderField } from '../fields/common';

/** Questions and answers on the public Help page, in the order given. */
export const Faqs: CollectionConfig = {
  slug: 'faqs',
  labels: { singular: 'FAQ', plural: 'FAQs' },
  admin: { useAsTitle: 'question', defaultColumns: ['question', 'order', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 20 },
  defaultSort: 'order',
  fields: [
    { name: 'question', type: 'text', required: true, maxLength: 200 },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
      maxLength: 2000,
      admin: { description: 'Plain text; `code`, **bold** and *italic* work, as in lessons.' },
    },
    orderField,
  ],
};
