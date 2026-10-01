import 'server-only';
import { type AlertKind, AlertKindSchema } from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** Insert-only. Support reviews these in the admin (Security alerts). */
export async function recordAlert(
  kind: AlertKind,
  userId: string,
  details: Record<string, string | number | null>,
): Promise<void> {
  const now = new Date();
  await getDb()
    .collection(COLLECTIONS.securityAlerts)
    .insertOne({
      kind: AlertKindSchema.parse(kind),
      userId,
      details,
      reviewed: false,
      createdAt: now,
      updatedAt: now,
    });
}
