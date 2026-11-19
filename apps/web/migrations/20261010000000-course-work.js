// Graded assessments and capstone projects (ADR 0029). One attempts document per learner and
// assessment; at most one capstone submission waiting for review per learner and capstone; each
// submission's .zip in its own document so lists never load files.

const COLLECTIONS = ['assessment_attempts', 'capstone_submissions', 'capstone_files'];

export async function up(db) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of COLLECTIONS) if (!existing.has(name)) await db.createCollection(name);
  await db
    .collection('assessment_attempts')
    .createIndex({ userId: 1, assessmentId: 1 }, { name: 'user_assessment_unique', unique: true });
  await db.collection('capstone_submissions').createIndexes([
    { key: { publicId: 1 }, name: 'publicId_unique', unique: true },
    { key: { userId: 1, capstoneId: 1, submittedAt: -1 }, name: 'user_capstone_submittedAt' },
    {
      key: { userId: 1, capstoneId: 1 },
      name: 'one_waiting_per_learner',
      unique: true,
      partialFilterExpression: { status: 'submitted' },
    },
    { key: { status: 1, submittedAt: 1 }, name: 'status_submittedAt' },
  ]);
  await db.collection('capstone_files').createIndexes([
    { key: { submissionId: 1 }, name: 'submissionId_unique', unique: true },
    { key: { userId: 1 }, name: 'userId' },
  ]);
}

export async function down(db) {
  await db.collection('assessment_attempts').dropIndex('user_assessment_unique');
  for (const name of [
    'publicId_unique',
    'user_capstone_submittedAt',
    'one_waiting_per_learner',
    'status_submittedAt',
  ])
    await db.collection('capstone_submissions').dropIndex(name);
  for (const name of ['submissionId_unique', 'userId'])
    await db.collection('capstone_files').dropIndex(name);
}
