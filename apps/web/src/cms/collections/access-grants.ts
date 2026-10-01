import { LEVELS } from '@siliconbox/shared';
import { APIError, type CollectionConfig } from 'payload';
import { hasRole } from '../access';

const canGrant = hasRole('support', 'owner');
const options = (values: readonly string[]) => values.map((value) => ({ label: value, value }));

type GrantData = {
  learnerEmail?: string;
  kind?: 'content' | 'tool';
  level?: (typeof LEVELS)[number] | null;
  startsAt?: string;
  endsAt?: string;
  reason?: string;
  learnerId?: string;
};

/**
 * Support grants, extends or shortens a learner's content or tool window (access model: admin
 * control). Grants are append-only records: a change is a new grant, never an edit. Server
 * modules load lazily because this config is also read by command-line scripts.
 */
export const AccessGrants: CollectionConfig = {
  slug: 'access-grants',
  admin: {
    useAsTitle: 'learnerEmail',
    defaultColumns: ['learnerEmail', 'kind', 'level', 'endsAt', 'createdAt'],
  },
  access: { read: canGrant, create: canGrant, update: () => false, delete: () => false },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        if (operation !== 'create') return data;
        const { findUserIdByEmail } = await import('../../db/users');
        const learnerId = await findUserIdByEmail(String((data as GrantData).learnerEmail));
        if (learnerId === null)
          throw new APIError('No learner has signed up with that email.', 400, null, true);
        return { ...data, learnerId, grantedBy: req.user?.id };
      },
    ],
    afterChange: [
      async ({ doc, operation, req }) => {
        const grant = doc as Required<GrantData>;
        if (operation !== 'create') return grant;
        const { applyAdminGrant } = await import('../../server/grants');
        await applyAdminGrant({
          userId: grant.learnerId,
          kind: grant.kind,
          level: grant.kind === 'content' ? grant.level : null,
          startsAt: new Date(grant.startsAt),
          endsAt: new Date(grant.endsAt),
          reason: grant.reason,
          actorId: String(req.user?.id),
        });
        return grant;
      },
    ],
  },
  fields: [
    { name: 'learnerEmail', type: 'email', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'content',
      options: options(['content', 'tool']),
    },
    {
      name: 'level',
      type: 'select',
      options: options(LEVELS),
      admin: { condition: (data) => (data as GrantData).kind === 'content' },
      validate: (value: unknown, { data }: { data: unknown }) =>
        (data as GrantData).kind !== 'content' || typeof value === 'string'
          ? true
          : 'Choose a level.',
    },
    {
      name: 'startsAt',
      type: 'date',
      required: true,
      defaultValue: () => new Date().toISOString(),
    },
    {
      name: 'endsAt',
      type: 'date',
      required: true,
      validate: (value: unknown, { data }: { data: unknown }) => {
        const startsAt = (data as GrantData).startsAt;
        return typeof value === 'string' && (startsAt === undefined || value > startsAt)
          ? true
          : 'The end must be after the start.';
      },
    },
    {
      name: 'reason',
      type: 'textarea',
      required: true,
      minLength: 3,
      maxLength: 500,
      admin: { description: 'Why this change is made. Saved in the audit log.' },
    },
    { name: 'learnerId', type: 'text', admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'grantedBy',
      type: 'relationship',
      relationTo: 'admins',
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
};
