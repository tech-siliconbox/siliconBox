// `companies` and `answers` are now CMS collections. Payload creates their indexes from the
// field definitions (unique slug, unique question), and MongoDB refuses the same key twice under
// another name, so the hand-made copies from the first migration go.

const HAND_MADE = [
  { collection: 'companies', name: 'slug_unique', key: { slug: 1 } },
  { collection: 'answers', name: 'questionId_unique', key: { questionId: 1 } },
];

async function dropIfPresent(db, { collection, name }) {
  const names = (await db.collection(collection).indexes()).map((index) => index.name);
  if (names.includes(name)) await db.collection(collection).dropIndex(name);
}

export async function up(db) {
  for (const index of HAND_MADE) await dropIfPresent(db, index);
}

// Restores the hand-made indexes only when Payload's own copies are absent.
export async function down(db) {
  for (const { collection, name, key } of HAND_MADE) {
    const existing = await db.collection(collection).indexes();
    const sameKey = existing.some((index) => JSON.stringify(index.key) === JSON.stringify(key));
    if (!sameKey) await db.collection(collection).createIndex(key, { name, unique: true });
  }
}
