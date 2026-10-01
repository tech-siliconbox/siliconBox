import 'server-only';
import { createHash } from 'node:crypto';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

// Only hashes of ended tokens are kept, and only long enough to tell the old device why
// (a TTL index removes them). Used to choose a message, never to grant access.

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function recordReplacedSessions(userId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const endedAt = new Date();
  await getDb()
    .collection(COLLECTIONS.endedSessions)
    .insertMany(tokens.map((token) => ({ tokenHash: hashToken(token), userId, endedAt })));
}

export async function wasReplaced(token: string): Promise<boolean> {
  const found = await getDb()
    .collection(COLLECTIONS.endedSessions)
    .findOne({ tokenHash: hashToken(token) }, { projection: { _id: 1 } });
  return found !== null;
}
