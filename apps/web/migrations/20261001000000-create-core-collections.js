// Core collections and indexes from docs/architecture/data-model.md.
// A migration is a frozen snapshot: names are written out here, not imported from app code.

const DAY_SECONDS = 24 * 60 * 60;

const INDEXES = {
  users: [{ key: { email: 1 }, name: 'email_unique', unique: true }],
  sessions: [
    { key: { token: 1 }, name: 'token_unique', unique: true },
    { key: { userId: 1 }, name: 'userId' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ],
  accounts: [
    { key: { providerId: 1, accountId: 1 }, name: 'provider_account_unique', unique: true },
    { key: { userId: 1 }, name: 'userId' },
  ],
  verifications: [
    { key: { identifier: 1 }, name: 'identifier' },
    { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 },
  ],
  twoFactors: [{ key: { userId: 1 }, name: 'userId_unique', unique: true }],
  // Tool entitlements have no level, so each user holds at most one tool window.
  entitlements: [
    { key: { userId: 1, kind: 1, level: 1 }, name: 'user_kind_level_unique', unique: true },
  ],
  orders: [
    {
      key: { paymentId: 1 },
      name: 'paymentId_unique',
      unique: true,
      partialFilterExpression: { paymentId: { $type: 'string' } },
    },
    { key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' },
  ],
  progress: [{ key: { userId: 1, lessonId: 1 }, name: 'user_lesson_unique', unique: true }],
  runs: [{ key: { userId: 1, createdAt: -1 }, name: 'user_createdAt' }],
  questions: [{ key: { text: 'text' }, name: 'text_search' }],
  companies: [{ key: { slug: 1 }, name: 'slug_unique', unique: true }],
  drill_private: [],
  answers: [{ key: { questionId: 1 }, name: 'questionId_unique', unique: true }],
  audit_log: [
    { key: { createdAt: -1 }, name: 'createdAt' },
    { key: { subjectId: 1, createdAt: -1 }, name: 'subject_createdAt' },
  ],
  // Long enough to explain a sign-out to a device that was away for a whole session lifetime.
  ended_sessions: [
    { key: { tokenHash: 1 }, name: 'tokenHash' },
    { key: { endedAt: 1 }, name: 'endedAt_ttl', expireAfterSeconds: 7 * DAY_SECONDS },
  ],
};

export async function up(db) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const [name, indexes] of Object.entries(INDEXES)) {
    if (!existing.has(name)) await db.createCollection(name);
    if (indexes.length > 0) await db.collection(name).createIndexes(indexes);
  }
}

// Drops only the indexes; collections are kept so a rollback never deletes data.
export async function down(db) {
  for (const [name, indexes] of Object.entries(INDEXES)) {
    for (const index of indexes) await db.collection(name).dropIndex(index.name);
  }
}
