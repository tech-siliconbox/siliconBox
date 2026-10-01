// Resume Builder and CV screening (docs/product/industry-ready.md): per-learner storage with
// delete. CV screenings keep only the report; uploaded files are never stored. Both services
// now work, so they open, unless an admin has already changed them.

const OPENED = ['resume-builder', 'cv-screening'];

export async function up(db) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of ['resumes', 'cv_screenings'])
    if (!existing.has(name)) await db.createCollection(name);
  await db
    .collection('resumes')
    .createIndex({ userId: 1 }, { name: 'userId_unique', unique: true });
  await db.collection('cv_screenings').createIndexes([
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
    { key: { publicId: 1 }, name: 'publicId_unique', unique: true },
  ]);
  await db
    .collection('services')
    .updateMany(
      { slug: { $in: OPENED }, status: 'locked', lockedReason: 'Opening soon' },
      { $set: { status: 'open', updatedAt: new Date() } },
    );
}

export async function down(db) {
  await db.collection('resumes').dropIndex('userId_unique');
  await db.collection('cv_screenings').dropIndex('user_createdAt');
  await db.collection('cv_screenings').dropIndex('publicId_unique');
  await db
    .collection('services')
    .updateMany(
      { slug: { $in: OPENED }, status: 'open' },
      { $set: { status: 'locked', lockedReason: 'Opening soon' } },
    );
}
