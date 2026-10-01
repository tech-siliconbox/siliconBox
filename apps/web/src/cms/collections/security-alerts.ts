import { AlertKindSchema } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { hasRole } from '../access';

const canReview = hasRole('support', 'owner');

/**
 * Alerts raised by the site (src/server/alerts.ts) for Support to review. Written only by the
 * site; in the admin they can be read and marked reviewed, never created or deleted.
 */
export const SecurityAlerts: CollectionConfig = {
  slug: 'security-alerts',
  admin: { useAsTitle: 'kind', defaultColumns: ['kind', 'userId', 'reviewed', 'createdAt'] },
  access: { read: canReview, update: canReview, create: () => false, delete: () => false },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'kind',
      type: 'select',
      required: true,
      options: AlertKindSchema.options.map((kind) => ({ label: kind, value: kind })),
      access: { update: () => false },
    },
    { name: 'userId', type: 'text', required: true, access: { update: () => false } },
    { name: 'details', type: 'json', access: { update: () => false } },
    { name: 'reviewed', type: 'checkbox', defaultValue: false },
  ],
};
