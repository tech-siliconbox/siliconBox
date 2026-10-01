import { ServiceStatusSchema } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { orderField, titleField } from '../fields/common';
import { slugField } from '../fields/slug';

/** Industry Ready services (docs/product/industry-ready.md). Locked services refuse every call. */
export const Services: CollectionConfig = {
  slug: 'services',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'status', 'order'] },
  access: contentAccess,
  defaultSort: 'order',
  fields: [
    titleField,
    slugField,
    { name: 'summary', type: 'textarea', maxLength: 300 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'locked',
      options: ServiceStatusSchema.options.map((status) => ({ label: status, value: status })),
      admin: { description: 'Open only once the service works end to end.' },
    },
    {
      name: 'lockedReason',
      type: 'text',
      maxLength: 120,
      defaultValue: 'Opening soon',
      admin: { condition: (data) => (data as { status?: string }).status === 'locked' },
    },
    orderField,
  ],
};
