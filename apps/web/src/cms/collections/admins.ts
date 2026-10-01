import { AdminRoleSchema } from '@siliconbox/shared';
import type { CollectionConfig } from 'payload';
import { hasRole, isAdmin, isOwnerField } from '../access';

const TWO_HOURS_SECONDS = 2 * 60 * 60;

/** Admin accounts (Author, Editor, Support, Owner), separate from learner accounts. */
export const Admins: CollectionConfig = {
  slug: 'admins',
  auth: {
    tokenExpiration: TWO_HOURS_SECONDS,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    cookies: { sameSite: 'Strict', secure: process.env.NODE_ENV === 'production' },
  },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'role'] },
  access: {
    admin: isAdmin,
    read: isAdmin,
    create: hasRole('owner'),
    update: hasRole('owner'),
    delete: hasRole('owner'),
  },
  hooks: {
    beforeChange: [
      // The very first admin (created on the setup screen) becomes the owner.
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data;
        // `find`, not `count`: MongoDB refuses count inside the transaction Payload opens here.
        const { docs } = await req.payload.find({
          collection: 'admins',
          limit: 1,
          depth: 0,
          pagination: false,
          req,
        });
        return docs.length === 0 ? { ...data, role: 'owner' } : data;
      },
    ],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'author',
      saveToJWT: true,
      options: AdminRoleSchema.options.map((role) => ({ label: role, value: role })),
      access: { update: isOwnerField },
    },
  ],
};
