import 'server-only';
import config from '@payload-config';
import { type AdminRole, AdminRoleSchema } from '@siliconbox/shared';
import { headers } from 'next/headers';
import { getPayload } from 'payload';

/**
 * The signed-in CMS admin for this request, using Payload's own session, or null for a learner
 * or a visitor. Admin-only pages (lesson preview, watermark trace) start here.
 */
export async function cmsAdminSession() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (user?.collection !== 'admins') return null;
  const role = AdminRoleSchema.safeParse(user.role);
  if (!role.success) return null;
  return { payload, user, admin: { id: user.id, email: user.email, role: role.data } };
}

export const hasAdminRole = (role: AdminRole, allowed: readonly AdminRole[]): boolean =>
  allowed.includes(role);
