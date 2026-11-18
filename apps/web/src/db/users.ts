import 'server-only';
import { ObjectId } from 'mongodb';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** The learner account id for an email address, or null when nobody has signed up with it. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const user = await getDb()
    .collection(COLLECTIONS.users)
    .findOne({ email: email.trim().toLowerCase() }, { projection: { _id: 1 } });
  return user === null ? null : String(user._id);
}

export type LearnerSummary = { id: string; email: string; name: string; createdAt: string };

const LEARNER_FIELDS = { projection: { _id: 1, email: 1, name: 1, createdAt: 1 } } as const;
const MATCH_LIMIT = 20;

function toSummary(user: Record<string, unknown>): LearnerSummary {
  const created = user.createdAt instanceof Date ? user.createdAt.toISOString() : '';
  return {
    id: String(user._id),
    email: typeof user.email === 'string' ? user.email : '',
    name: typeof user.name === 'string' ? user.name : '',
    createdAt: created,
  };
}

/** Learner accounts by id, for admin tools. Ids that are not account ids are skipped. */
export async function findLearnersByIds(ids: string[]): Promise<LearnerSummary[]> {
  const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return [];
  const users = await getDb()
    .collection(COLLECTIONS.users)
    .find({ _id: { $in: objectIds } }, LEARNER_FIELDS)
    .limit(MATCH_LIMIT)
    .toArray();
  return users.map(toSummary);
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Learners whose account matches a visible mark: the email starts with the fragment, has the
 * domain, and the account id ends with the short id.
 */
export async function findLearnersByVisibleMark(mark: {
  shortId: string;
  emailPrefix: string;
  domain: string;
}): Promise<LearnerSummary[]> {
  const email = new RegExp(
    `^${escapeRegex(mark.emailPrefix)}[^@]*@${escapeRegex(mark.domain)}$`,
    'i',
  );
  const users = await getDb()
    .collection(COLLECTIONS.users)
    .find({ email }, LEARNER_FIELDS)
    .limit(500)
    .toArray();
  return users
    .filter((user) => String(user._id).endsWith(mark.shortId))
    .slice(0, MATCH_LIMIT)
    .map(toSummary);
}
