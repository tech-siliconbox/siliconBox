import 'server-only';
import { Redis } from 'ioredis';
import { getConfig } from './config';
import { log } from './log';

const globalForRedis = globalThis as typeof globalThis & { siliconboxRedis?: Redis };

function createRedis(): Redis {
  const redis = new Redis(getConfig().REDIS_URL, {
    maxRetriesPerRequest: 1,
    commandTimeout: 1_000,
  });
  // While Redis is unreachable, rate-limited routes refuse requests (fail closed) and the client
  // keeps reconnecting. Report the outage through our logger instead of an unhandled event.
  redis.on('error', (error: Error) => {
    log('error', 'redis_unavailable', { message: error.message });
  });
  return redis;
}

export function getRedis(): Redis {
  globalForRedis.siliconboxRedis ??= createRedis();
  return globalForRedis.siliconboxRedis;
}
