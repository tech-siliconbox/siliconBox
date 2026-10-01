import 'server-only';
import { type ProtectedResource, decideAccess } from '@siliconbox/shared';
import { findEntitlements } from '@/db/entitlements';
import type { Identity } from './auth/authenticate';
import { AppError } from './errors';

/** The one entitlement check every route uses. Always reads the database, never a cache. */
export async function assertEntitled(
  resource: ProtectedResource,
  identity: Identity | null,
  now: Date = new Date(),
): Promise<void> {
  const viewer =
    identity === null ? null : { entitlements: await findEntitlements(identity.userId) };
  const decision = decideAccess(resource, viewer, now);
  if (!decision.allowed) {
    throw new AppError(
      decision.reason,
      `${resource.kind} denied for ${identity?.userId ?? 'guest'}`,
    );
  }
}
