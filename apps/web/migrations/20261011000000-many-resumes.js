// Several resumes per learner (docs/product/industry-ready.md, Phase C): each resume gets a
// public id, a name and a creation date, and the one-per-learner index gives way to one on the
// learner and their latest edit. Resumes on the compact template keep their look under the new
// design settings (9 pt, compact spacing).
import { randomUUID } from 'node:crypto';

const COMPACT_DESIGN = {
  font: 'sans',
  fontSize: 9,
  spacing: 'compact',
  margins: 'normal',
  accent: 'black',
  pageSize: 'A4',
};

export async function up(db) {
  const resumes = db.collection('resumes');
  const names = (await resumes.indexes()).map((index) => index.name);
  if (names.includes('userId_unique')) await resumes.dropIndex('userId_unique');
  for await (const doc of resumes.find({ publicId: { $exists: false } })) {
    const set = {
      publicId: randomUUID(),
      title: 'My resume',
      createdAt: doc.updatedAt ?? new Date(),
    };
    if (doc.resume?.template === 'compact' && doc.resume.design === undefined) {
      set['resume.design'] = COMPACT_DESIGN;
    }
    await resumes.updateOne({ _id: doc._id }, { $set: set });
  }
  await resumes.createIndexes([
    { key: { publicId: 1 }, name: 'publicId_unique', unique: true },
    { key: { userId: 1, updatedAt: -1 }, name: 'user_updatedAt' },
  ]);
}

/** Keeps every resume; the one-per-learner index returns only if no learner has several. */
export async function down(db) {
  const resumes = db.collection('resumes');
  await resumes.dropIndex('publicId_unique');
  await resumes.dropIndex('user_updatedAt');
  await resumes.createIndex({ userId: 1 }, { name: 'userId_unique', unique: true });
}
