import 'server-only';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** The learner account id for an email address, or null when nobody has signed up with it. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const user = await getDb()
    .collection(COLLECTIONS.users)
    .findOne({ email: email.trim().toLowerCase() }, { projection: { _id: 1 } });
  return user === null ? null : String(user._id);
}
