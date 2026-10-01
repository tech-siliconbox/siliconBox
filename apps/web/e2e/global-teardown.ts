import type { Db } from 'mongodb';
import { withAdminDb } from './db';

// Invented data only: `.test` is a reserved domain no real person can sign up with, and test
// content uses slugs starting with `e2e-` (questions: text starting with "Invented question e2e-").
const TEST_EMAIL = /@example\.test$/;
const TEST_SLUG = /^e2e-/;
const TEST_QUESTION = /^Invented question e2e-/;

async function removeTestLearners(db: Db): Promise<void> {
  const users = await db
    .collection('users')
    .find({ email: TEST_EMAIL }, { projection: { _id: 1 } })
    .toArray();
  const ids = users.map((user) => user._id);
  const idStrings = ids.map(String);
  await Promise.all([
    ...['sessions', 'accounts', 'twoFactors'].map((name) =>
      db.collection(name).deleteMany({ userId: { $in: ids } }),
    ),
    ...['ended_sessions', 'entitlements', 'watermark_codes', 'progress'].map((name) =>
      db.collection(name).deleteMany({ userId: { $in: idStrings } }),
    ),
    db.collection('audit_log').deleteMany({ subjectId: { $in: idStrings } }),
  ]);
  await db.collection('users').deleteMany({ _id: { $in: ids } });
}

async function removeTestContent(db: Db): Promise<void> {
  for (const name of ['lessons', 'modules', 'courses']) {
    const docs = await db
      .collection(name)
      .find({ slug: TEST_SLUG }, { projection: { _id: 1 } })
      .toArray();
    const ids = docs.map((doc) => doc._id);
    await db.collection(`_${name}_versions`).deleteMany({ parent: { $in: ids } });
    await db.collection(name).deleteMany({ _id: { $in: ids } });
  }
}

async function removeTestQuestions(db: Db): Promise<void> {
  const questions = await db
    .collection('questions')
    .find({ text: TEST_QUESTION }, { projection: { _id: 1 } })
    .toArray();
  const ids = questions.map((question) => question._id);
  const answers = await db
    .collection('answers')
    .find({ question: { $in: ids } }, { projection: { _id: 1 } })
    .toArray();
  await db
    .collection('_answers_versions')
    .deleteMany({ parent: { $in: answers.map((answer) => answer._id) } });
  await db.collection('answers').deleteMany({ question: { $in: ids } });
  await db.collection('_questions_versions').deleteMany({ parent: { $in: ids } });
  await db.collection('questions').deleteMany({ _id: { $in: ids } });
  await db.collection('companies').deleteMany({ slug: TEST_SLUG });
}

async function removeTestGrants(db: Db): Promise<void> {
  await db.collection('access-grants').deleteMany({ learnerEmail: TEST_EMAIL });
}

async function removeTestAdmins(db: Db): Promise<void> {
  const admins = await db
    .collection('admins')
    .find({ email: TEST_EMAIL }, { projection: { _id: 1 } })
    .toArray();
  const ids = admins.map((admin) => admin._id);
  await db.collection('payload-preferences').deleteMany({ 'user.value': { $in: ids } });
  await db.collection('admins').deleteMany({ _id: { $in: ids } });
}

/** Removes everything the end-to-end tests created. */
export default async function globalTeardown(): Promise<void> {
  await withAdminDb(async (db) => {
    await removeTestContent(db);
    await removeTestQuestions(db);
    await removeTestGrants(db);
    await removeTestAdmins(db);
    await removeTestLearners(db);
  });
}
