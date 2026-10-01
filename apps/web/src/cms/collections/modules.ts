import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import {
  clearLessonCacheAfterChange,
  clearLessonCacheAfterDelete,
} from '../hooks/clear-lesson-cache';
import { orderField, titleField } from '../fields/common';
import { slugField } from '../fields/slug';

export const Modules: CollectionConfig = {
  slug: 'modules',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'course', 'order'] },
  access: contentAccess,
  hooks: {
    afterChange: [clearLessonCacheAfterChange],
    afterDelete: [clearLessonCacheAfterDelete],
  },
  defaultSort: 'order',
  fields: [
    titleField,
    slugField,
    { name: 'course', type: 'relationship', relationTo: 'courses', required: true, index: true },
    { name: 'summary', type: 'textarea', maxLength: 300 },
    orderField,
  ],
};
