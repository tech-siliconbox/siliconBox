import { COURSE_AVAILABILITY, type CourseAvailability, LEVELS } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import {
  clearLessonCacheAfterChange,
  clearLessonCacheAfterDelete,
} from '../hooks/clear-lesson-cache';
import { orderField, titleField } from '../fields/common';
import { publicIdField } from '../fields/public-id';
import { slugField } from '../fields/slug';

const AVAILABILITY_LABEL: Readonly<Record<CourseAvailability, string>> = {
  open: 'Open',
  comingSoon: 'Coming soon',
};

export const Courses: CollectionConfig = {
  slug: 'courses',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'level', 'order', '_status'] },
  access: contentAccess,
  hooks: {
    afterChange: [clearLessonCacheAfterChange],
    afterDelete: [clearLessonCacheAfterDelete],
  },
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
    {
      name: 'availability',
      type: 'select',
      required: true,
      defaultValue: 'open',
      options: COURSE_AVAILABILITY.map((value) => ({ label: AVAILABILITY_LABEL[value], value })),
      admin: {
        position: 'sidebar',
        description:
          'Coming soon: the catalogue and pricing say so, the course page shows no outline, and none of its lessons or Drills is served, even to learners with access.',
      },
    },
    { name: 'summary', type: 'textarea', maxLength: 600 },
    {
      name: 'introduction',
      type: 'code',
      admin: {
        language: 'html',
        description:
          'Optional: the course home page in your own markup (shown publicly instead of the plain outline). Links to lessons are written lesson:<slug>.',
      },
    },
    orderField,
    publicIdField,
  ],
};
