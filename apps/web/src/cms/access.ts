import { type AdminRole, AdminRoleSchema } from '@siliconbox/shared';
import type { Access, FieldAccess, PayloadRequest } from 'payload';

// Payload access mirrors docs/architecture/admin-cms.md. Learners never use the CMS API:
// every read requires a signed-in admin, and the site serves content through /api/v1.

function roleOf(req: PayloadRequest): AdminRole | null {
  const parsed = AdminRoleSchema.safeParse(req.user?.role);
  return parsed.success ? parsed.data : null;
}

/** Boolean (not a query) so it also works as the collection's `admin` panel access. */
export function isAdmin({ req }: { req: PayloadRequest }): boolean {
  return roleOf(req) !== null;
}

export function hasRole(...roles: AdminRole[]): Access {
  return ({ req }) => {
    const role = roleOf(req);
    return role !== null && roles.includes(role);
  };
}

export const isOwnerField: FieldAccess = ({ req }) => roleOf(req) === 'owner';

/** Authors save drafts only; editors and owners may also publish. */
const canWriteContent: Access = ({ req, data }) => {
  const role = roleOf(req);
  if (role === 'editor' || role === 'owner') return true;
  return role === 'author' && (data as { _status?: string } | undefined)?._status !== 'published';
};

const canDeleteContent = hasRole('editor', 'owner');

/** The access every content collection uses: admins read, authors draft, editors publish. */
export const contentAccess = {
  read: isAdmin,
  create: canWriteContent,
  update: canWriteContent,
  delete: canDeleteContent,
};
