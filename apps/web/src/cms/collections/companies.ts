import type { CollectionConfig } from 'payload';
import { contentAccess } from '../access';
import { slugField } from '../fields/slug';

/**
 * Companies shown as tags on questions. Name only for now: logos need each company's permission
 * (docs/legal/trademark-and-logos.md) and file storage, both still to come.
 */
export const Companies: CollectionConfig = {
  slug: 'companies',
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'slug'] },
  access: contentAccess,
  defaultSort: 'name',
  fields: [{ name: 'name', type: 'text', required: true, maxLength: 120 }, slugField],
};
