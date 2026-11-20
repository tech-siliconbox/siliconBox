import 'server-only';
import {
  type PramanCeilings,
  type ProtectedResource,
  decideAccess,
  pramanCeilings,
} from '@siliconbox/shared';
import { findEntitlements } from '@/db/entitlements';
import type { Identity } from './auth/authenticate';
import { AppError } from './errors';

async function decide(resource: ProtectedResource, identity: Identity | null, now: Date) {
  const viewer =
    identity === null ? null : { entitlements: await findEntitlements(identity.userId) };
  return decideAccess(resource, viewer, now);
}

/** The one entitlement check every route uses. Always reads the database, never a cache. */
export async function assertEntitled(
  resource: ProtectedResource,
  identity: Identity | null,
  now: Date = new Date(),
): Promise<void> {
  const decision = await decide(resource, identity, now);
  if (!decision.allowed) {
    throw new AppError(
      decision.reason,
      `${resource.kind} denied for ${identity?.userId ?? 'guest'}`,
    );
  }
}

/** The same check as a yes or no, for showing what a learner may do on a page they can open. */
export async function isEntitled(
  resource: ProtectedResource,
  identity: Identity | null,
  now: Date = new Date(),
): Promise<boolean> {
  return (await decide(resource, identity, now)).allowed;
}

/** Praman's ceilings for this learner (ADR 0031); refused like assertEntitled without access. */
export async function assertPraman(
  identity: Identity,
  now: Date = new Date(),
): Promise<PramanCeilings> {
  const ceilings = pramanCeilings(await findEntitlements(identity.userId), now);
  if (ceilings === null) throw new AppError('NOT_ENTITLED', `praman denied for ${identity.userId}`);
  return ceilings;
}
