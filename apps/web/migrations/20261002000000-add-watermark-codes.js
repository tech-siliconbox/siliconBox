// Private lookup from invisible watermark code to learner, for tracing leaks.
// Several learners may share a 32-bit code, so the pair is unique, not the code alone.

export async function up(db) {
  const existing = await db
    .listCollections({ name: 'watermark_codes' }, { nameOnly: true })
    .toArray();
  if (existing.length === 0) await db.createCollection('watermark_codes');
  await db
    .collection('watermark_codes')
    .createIndex({ code: 1, userId: 1 }, { name: 'code_user_unique', unique: true });
}

// Drops only the index; the collection is kept so a rollback never deletes tracing data.
export async function down(db) {
  await db.collection('watermark_codes').dropIndex('code_user_unique');
}
