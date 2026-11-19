import 'server-only';
import { type Db, MongoClient } from 'mongodb';
import { getConfig } from '@/server/config';

const globalForMongo = globalThis as typeof globalThis & { siliconboxMongo?: MongoClient };

/**
 * Every database user's long-lived client is built here (the dev startup check in
 * connection-status.ts opens its own short one). Serverless hosts start many small instances, and
 * Atlas free (M0) allows 500 connections in all, so each client keeps a small pool and lets idle
 * connections go (docs/architecture/hosting.md).
 */
export function createMongoClient(uri: string, appName: string): MongoClient {
  return new MongoClient(uri, { appName, maxPoolSize: 10, maxIdleTimeMS: 60_000 });
}

/** One MongoClient per server instance; it connects lazily. */
export function getMongoClient(): MongoClient {
  globalForMongo.siliconboxMongo ??= createMongoClient(
    getConfig().MONGODB_URI_APP,
    'siliconbox-web',
  );
  return globalForMongo.siliconboxMongo;
}

export function getDb(): Db {
  return getMongoClient().db();
}
