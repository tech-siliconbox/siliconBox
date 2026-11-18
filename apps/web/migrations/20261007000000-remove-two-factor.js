// Two-factor sign-in was removed (ADR 0025). Authenticator secrets and backup codes must not
// outlive the feature, so the collection is dropped and the users' flag cleared. The secrets
// cannot come back: down only recreates the empty collection and its index.

export async function up(db) {
  const [found] = await db.listCollections({ name: 'twoFactors' }, { nameOnly: true }).toArray();
  if (found) await db.collection('twoFactors').drop();
  await db
    .collection('users')
    .updateMany({ twoFactorEnabled: { $exists: true } }, { $unset: { twoFactorEnabled: '' } });
}

export async function down(db) {
  await db.createCollection('twoFactors');
  await db
    .collection('twoFactors')
    .createIndex({ userId: 1 }, { name: 'userId_unique', unique: true });
}
