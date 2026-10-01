import 'server-only';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** Records which learner a watermark code belongs to; idempotent. */
export async function registerMarkCode(code: number, userId: string): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.watermarkCodes)
    .updateOne({ code, userId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}
