import { existsSync } from 'node:fs';
import { type Db, MongoClient } from 'mongodb';

/** Runs `work` against the test database with the admin user, then closes the connection. */
export async function withAdminDb<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const localEnv = new URL('../.env.local', import.meta.url);
  if (existsSync(localEnv)) process.loadEnvFile(localEnv);
  const uri = process.env.MONGODB_URI_ADMIN;
  if (uri === undefined)
    throw new Error('MONGODB_URI_ADMIN is required for end-to-end database setup');
  const client = new MongoClient(uri);
  try {
    return await work(client.db());
  } finally {
    await client.close();
  }
}
