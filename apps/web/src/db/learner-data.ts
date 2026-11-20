import 'server-only';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/**
 * The collections holding a learner's own data under their id. Deleting the account empties them.
 * Kept: the audit log and security alerts (records security needs; the site cannot change them),
 * and orders once payments exist (records the law needs).
 */
const LEARNER_DATA = [
  'entitlements',
  'progress',
  'runs',
  'resumes',
  'cvScreenings',
  'profiles',
  'avatars',
  'assessmentAttempts',
  'capstoneSubmissions',
  'capstoneFiles',
  'watermarkCodes',
  'endedSessions',
  'toolSessions',
  'toolFiles',
  'toolRuns',
  'toolTraces',
] as const;

/** Deletes a learner's own data; Better Auth then deletes the account, its sessions and sign-ins. */
export async function deleteLearnerData(userId: string): Promise<void> {
  const db = getDb();
  await Promise.all([
    ...LEARNER_DATA.map((name) => db.collection(COLLECTIONS[name]).deleteMany({ userId })),
    // Password reset links still waiting for the account.
    db.collection(COLLECTIONS.verifications).deleteMany({ value: userId }),
  ]);
}
