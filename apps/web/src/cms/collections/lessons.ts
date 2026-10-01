import { ROUTES } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import {
  clearLessonCacheAfterChange,
  clearLessonCacheAfterDelete,
} from '../hooks/clear-lesson-cache';
import { orderField, titleField } from '../fields/common';
import { publicIdField } from '../fields/public-id';
import { slugField } from '../fields/slug';
import { LESSON_BLOCKS } from './lesson-blocks';

/** Every save is a version; learners only ever see the last published one. */
export const Lessons: CollectionConfig = {
  slug: 'lessons',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'module', 'order', 'preview', '_status'],
    // "Preview" in the admin opens the latest draft as learners will see it (admins only).
    preview: (doc) => (typeof doc.id === 'string' ? ROUTES.lessonPreview(doc.id) : null),
  },
  access: contentAccess,
  hooks: {
    afterChange: [clearLessonCacheAfterChange],
    afterDelete: [clearLessonCacheAfterDelete],
  },
  // Scheduled publishing needs Payload's job runner (a cron on the host); add it with hosting.
  versions: { drafts: true, maxPerDoc: 50 },
  defaultSort: 'order',
  fields: [
    titleField,
    slugField,
    { name: 'module', type: 'relationship', relationTo: 'modules', required: true, index: true },
    orderField,
    {
      name: 'preview',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'A free preview lesson: any signed-in learner may read it.' },
    },
    { name: 'durationMinutes', type: 'number', min: 1, max: 600 },
    { name: 'blocks', type: 'blocks', required: true, minRows: 1, blocks: LESSON_BLOCKS },
    publicIdField,
  ],
};
