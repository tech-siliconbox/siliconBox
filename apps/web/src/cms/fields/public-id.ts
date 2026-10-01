import type { Field } from 'payload';

/** Random opaque id for URLs; the database id is never shown to learners. */
export const publicIdField: Field = {
  name: 'publicId',
  type: 'text',
  unique: true,
  index: true,
  admin: { readOnly: true, position: 'sidebar' },
  access: { update: () => false },
  hooks: {
    beforeValidate: [
      ({ value }) => (typeof value === 'string' && value !== '' ? value : crypto.randomUUID()),
    ],
  },
};
