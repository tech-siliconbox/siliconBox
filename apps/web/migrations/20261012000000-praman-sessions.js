// Praman, the formal tool page (ADR 0031): a learner's sessions, the texts of their files (once
// per learner, by hash), their runs and the runs' traces. Every record carries expiresAt: a session
// is removed 180 days after its last use, and its runs, traces and files are kept as long. A TTL
// index removes each record when its time comes.

const COLLECTIONS = ['tool_sessions', 'tool_files', 'tool_runs', 'tool_traces'];
const EXPIRES = { key: { expiresAt: 1 }, name: 'expiresAt_ttl', expireAfterSeconds: 0 };

export async function up(db) {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name),
  );
  for (const name of COLLECTIONS) if (!existing.has(name)) await db.createCollection(name);
  await db
    .collection('tool_sessions')
    .createIndexes([
      { key: { publicId: 1 }, name: 'publicId_unique', unique: true },
      { key: { userId: 1, lastUsedAt: -1 }, name: 'user_lastUsedAt' },
      EXPIRES,
    ]);
  await db
    .collection('tool_files')
    .createIndexes([
      { key: { userId: 1, sha: 1 }, name: 'user_sha_unique', unique: true },
      EXPIRES,
    ]);
  await db
    .collection('tool_runs')
    .createIndexes([
      { key: { userId: 1, publicId: 1 }, name: 'user_publicId_unique', unique: true },
      { key: { userId: 1, startedAt: -1 }, name: 'user_startedAt' },
      { key: { userId: 1, sessionId: 1, expiresAt: 1 }, name: 'user_session_expiresAt' },
      EXPIRES,
    ]);
  await db
    .collection('tool_traces')
    .createIndexes([
      { key: { runId: 1, propId: 1 }, name: 'run_prop_unique', unique: true },
      { key: { userId: 1, runId: 1 }, name: 'user_run' },
      { key: { userId: 1, sessionId: 1, expiresAt: 1 }, name: 'user_session_expiresAt' },
      EXPIRES,
    ]);
}

export async function down(db) {
  for (const name of COLLECTIONS) await db.collection(name).drop();
}
