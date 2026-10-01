import 'server-only';
import {
  type AuditEntry,
  type Entitlement,
  EntitlementSchema,
  type Level,
} from '@siliconbox/shared';
import { replaceEntitlement } from '@/db/entitlements';

export type AdminGrant = {
  userId: string;
  kind: Entitlement['kind'];
  level?: Level | null;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  actorId: string;
};

/**
 * The entitlement and audit entry for an admin grant. A grant replaces the learner's window for
 * that kind and level, so it both extends and shortens. Throws when the grant is not valid.
 */
export function buildAdminGrant(
  grant: AdminGrant,
  now: Date,
): { entitlement: Entitlement; audit: AuditEntry } {
  const { userId, kind, level, startsAt, endsAt, reason, actorId } = grant;
  const window = { userId, startsAt, endsAt, source: 'admin', reason } as const;
  const entitlement = EntitlementSchema.parse(
    kind === 'content' ? { ...window, kind, level } : { ...window, kind },
  );
  const audit: AuditEntry = {
    action: 'entitlement_change',
    actorId,
    subjectId: userId,
    reason,
    metadata: {
      kind,
      level: level ?? null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
    },
    createdAt: now,
  };
  return { entitlement, audit };
}

export async function applyAdminGrant(grant: AdminGrant, now: Date = new Date()): Promise<void> {
  const { entitlement, audit } = buildAdminGrant(grant, now);
  await replaceEntitlement(entitlement, audit);
}
