import 'server-only';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** Records which learner a watermark code belongs to; idempotent. */
export async function registerMarkCode(code: number, userId: string): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.watermarkCodes)
    .updateOne({ code, userId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}

/** The learners each code belongs to (a code is per learner; collisions are possible). */
export async function findUserIdsByMarkCodes(
  codes: number[],
): Promise<{ code: number; userId: string }[]> {
  if (codes.length === 0) return [];
  const rows = await getDb()
    .collection(COLLECTIONS.watermarkCodes)
    .find({ code: { $in: codes } }, { projection: { _id: 0, code: 1, userId: 1 } })
    .limit(50)
    .toArray();
  return rows.map((row) => ({ code: Number(row.code), userId: String(row.userId) }));
}
