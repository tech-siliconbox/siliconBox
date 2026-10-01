import 'server-only';
import { type AuditEntry, type Entitlement, EntitlementSchema } from '@siliconbox/shared';
import { appendAudit } from './audit-log';
import { getDb, getMongoClient } from './client';
import { COLLECTIONS } from './collections';

export async function findEntitlements(userId: string): Promise<Entitlement[]> {
  const documents = await getDb()
    .collection(COLLECTIONS.entitlements)
    .find({ userId }, { projection: { _id: 0 } })
    .toArray();
  return documents.map((document) => EntitlementSchema.parse(document));
}

/** One window per user, kind and level (the unique index); tool windows have no level. */
function windowKey(entitlement: Entitlement) {
  const level = entitlement.kind === 'content' ? entitlement.level : null;
  return { userId: entitlement.userId, kind: entitlement.kind, level };
}

/** Replaces the learner's window for this kind and level and audits it, in one transaction. */
export async function replaceEntitlement(
  entitlement: Entitlement,
  audit: AuditEntry,
): Promise<void> {
  const session = getMongoClient().startSession();
  try {
    await session.withTransaction(async () => {
      await getDb()
        .collection(COLLECTIONS.entitlements)
        .replaceOne(windowKey(entitlement), EntitlementSchema.parse(entitlement), {
          upsert: true,
          session,
        });
      await appendAudit(audit, session);
    });
  } finally {
    await session.endSession();
  }
}
