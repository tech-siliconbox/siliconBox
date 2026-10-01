import { LEVELS } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { orderField, titleField } from '../fields/common';
import { publicIdField } from '../fields/public-id';
import { slugField } from '../fields/slug';

export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'level', 'order', '_status'] },
  access: contentAccess,
  versions: { drafts: true, maxPerDoc: 50 },
  defaultSort: 'order',
  fields: [
    titleField,
    slugField,
    {
      name: 'level',
      type: 'select',
      required: true,
      options: LEVELS.map((level) => ({ label: level, value: level })),
    },
    { name: 'summary', type: 'textarea', maxLength: 600 },
    orderField,
    publicIdField,
  ],
};
