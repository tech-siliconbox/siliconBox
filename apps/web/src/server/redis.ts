import 'server-only';
import { Redis } from 'ioredis';
import { getConfig } from './config';

const globalForRedis = globalThis as typeof globalThis & { siliconboxRedis?: Redis };

export function getRedis(): Redis {
  globalForRedis.siliconboxRedis ??= new Redis(getConfig().REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 1_000,
  });
  return globalForRedis.siliconboxRedis;
}
