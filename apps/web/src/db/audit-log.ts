import 'server-only';
import { type AuditEntry, AuditEntrySchema } from '@siliconbox/shared';
import type { ClientSession } from 'mongodb';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/**
 * Append-only: this repository exposes no update or delete, and the app DB user has none.
 * Pass `session` to write inside a caller's transaction.
 */
export async function appendAudit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.auditLog)
    .insertOne(AuditEntrySchema.parse(entry), session === undefined ? {} : { session });
}
