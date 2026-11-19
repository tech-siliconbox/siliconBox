import 'server-only';
import type { AdminRole } from '@siliconbox/shared';
import { cmsAdminSession, hasAdminRole } from './cms-admin';

/** Our industry experts: the admins who grade capstones (ADR 0029). */
const GRADER_ROLES: readonly AdminRole[] = ['editor', 'owner'];

/** The signed-in expert, or null for anyone else (they get "not found"). */
export async function expertSession() {
  const session = await cmsAdminSession();
  return session !== null && hasAdminRole(session.admin.role, GRADER_ROLES) ? session : null;
}
