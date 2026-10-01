// Proves each database user can do what it needs and nothing more (infra/mongodb/roles.json).
// Usage: pnpm db:verify-roles   (reads apps/web/.env.local locally; the environment in CI)
// Forbidden writes use filters that match nothing, so no data changes even if a check fails.
import { existsSync } from 'node:fs';
import { type Db, MongoClient } from 'mongodb';

type Check = { what: string; allowed: boolean; run: (db: Db) => Promise<unknown> };

const NOTHING = { _id: 'no-such-document' } as never;

const CHECKS: Record<'MONGODB_URI_APP' | 'MONGODB_URI_ANSWERS' | 'MONGODB_URI_ADMIN', Check[]> = {
  MONGODB_URI_APP: [
    {
      what: 'read published lessons',
      allowed: true,
      run: (db) => db.collection('lessons').findOne({}),
    },
    {
      what: 'read learner accounts',
      allowed: true,
      run: (db) => db.collection('users').findOne({}),
    },
    {
      what: 'read paid answers',
      allowed: false,
      run: (db) => db.collection('answers').findOne({}),
    },
    {
      what: 'read Drill solutions',
      allowed: false,
      run: (db) => db.collection('drill_private').findOne({}),
    },
    {
      what: 'edit the audit log',
      allowed: false,
      run: (db) => db.collection('audit_log').updateOne(NOTHING, { $set: { x: 1 } }),
    },
    {
      what: 'edit lessons',
      allowed: false,
      run: (db) => db.collection('lessons').updateOne(NOTHING, { $set: { x: 1 } }),
    },
  ],
  MONGODB_URI_ANSWERS: [
    { what: 'read paid answers', allowed: true, run: (db) => db.collection('answers').findOne({}) },
    {
      what: 'read learner accounts',
      allowed: false,
      run: (db) => db.collection('users').findOne({}),
    },
    {
      what: 'edit answers',
      allowed: false,
      run: (db) => db.collection('answers').updateOne(NOTHING, { $set: { x: 1 } }),
    },
  ],
  MONGODB_URI_ADMIN: [
    {
      what: 'manage SiliconBox collections',
      allowed: true,
      run: (db) => db.listCollections().toArray(),
    },
    {
      what: 'reach other databases',
      allowed: false,
      run: (db) => db.client.db('sample_mflix').collection('movies').findOne({}),
    },
  ],
};

/** MongoDB reports code 13; Atlas wraps it as code 8000 "user is not allowed". */
function isUnauthorized(error: unknown): boolean {
  const { code, message } = error as { code?: number; message?: string };
  return code === 13 || (code === 8000 && /not allowed/i.test(message ?? ''));
}

async function outcome(check: Check, db: Db): Promise<boolean> {
  try {
    await check.run(db);
    return true;
  } catch (error) {
    if (isUnauthorized(error)) return false;
    throw error;
  }
}

async function connect(uri: string): Promise<MongoClient> {
  // New Atlas users can take a minute to become active.
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await new MongoClient(uri).connect();
    } catch (error) {
      if (attempt >= 12) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}

const localEnv = new URL('../.env.local', import.meta.url);
if (existsSync(localEnv)) process.loadEnvFile(localEnv);
let failures = 0;
for (const [variable, checks] of Object.entries(CHECKS)) {
  const client = await connect(process.env[variable] ?? '');
  for (const check of checks) {
    const allowed = await outcome(check, client.db());
    const ok = allowed === check.allowed;
    failures += ok ? 0 : 1;
    process.stdout.write(
      `${ok ? 'ok  ' : 'FAIL'} ${variable.replace('MONGODB_URI_', '').toLowerCase()} ${check.allowed ? 'can' : 'cannot'} ${check.what}\n`,
    );
  }
  await client.close();
}
process.exit(failures === 0 ? 0 : 1);
