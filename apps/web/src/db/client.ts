import 'server-only';
import { type Db, MongoClient } from 'mongodb';
import { getConfig } from '@/server/config';

const globalForMongo = globalThis as typeof globalThis & { siliconboxMongo?: MongoClient };

/** One MongoClient per server instance (Atlas free allows 500 connections); it connects lazily. */
export function getMongoClient(): MongoClient {
  globalForMongo.siliconboxMongo ??= new MongoClient(getConfig().MONGODB_URI_APP, {
    appName: 'siliconbox-web',
  });
  return globalForMongo.siliconboxMongo;
}

export function getDb(): Db {
  return getMongoClient().db();
}
