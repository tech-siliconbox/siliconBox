// Drill runs (phase 3, docs/architecture/solver-integration.md): one record per learner run,
// and run_cache answering identical code for the same Drill. Retention is a starting value
// (data-model.md left it to phase 3): runs 180 days, cached results 30 days.

const RUN_RETENTION_SECONDS = 180 * 24 * 60 * 60;
const CACHE_RETENTION_SECONDS = 30 * 24 * 60 * 60;

export async function up(db) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of ['runs', 'run_cache'])
    if (!existing.has(name)) await db.createCollection(name);
  await db.collection('runs').createIndexes([
    { key: { publicId: 1 }, name: 'publicId_unique', unique: true },
    { key: { userId: 1, requestId: 1 }, name: 'user_request_unique', unique: true },
    { key: { createdAt: 1 }, name: 'createdAt_ttl', expireAfterSeconds: RUN_RETENTION_SECONDS },
  ]);
  await db.collection('run_cache').createIndexes([
    { key: { hash: 1 }, name: 'hash_unique', unique: true },
    { key: { createdAt: 1 }, name: 'createdAt_ttl', expireAfterSeconds: CACHE_RETENTION_SECONDS },
  ]);
}

export async function down(db) {
  for (const name of ['publicId_unique', 'user_request_unique', 'createdAt_ttl'])
    await db.collection('runs').dropIndex(name);
  await db.collection('run_cache').drop();
}
