// Profiles (docs/product/member-area.md): a handle, bio and links per learner, and a photo kept
// as a small WebP in the database until object storage exists. Handles are unique once set.

export async function up(db) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of ['profiles', 'avatars'])
    if (!existing.has(name)) await db.createCollection(name);
  await db.collection('profiles').createIndexes([
    { key: { userId: 1 }, name: 'userId_unique', unique: true },
    {
      key: { handle: 1 },
      name: 'handle_unique',
      unique: true,
      partialFilterExpression: { handle: { $type: 'string' } },
    },
  ]);
  await db
    .collection('avatars')
    .createIndex({ userId: 1 }, { name: 'userId_unique', unique: true });
}

export async function down(db) {
  await db.collection('profiles').dropIndex('userId_unique');
  await db.collection('profiles').dropIndex('handle_unique');
  await db.collection('avatars').dropIndex('userId_unique');
}
