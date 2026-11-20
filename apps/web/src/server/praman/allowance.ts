import 'server-only';
import { DAY_MS } from '@siliconbox/shared';
import { z } from 'zod';
import { getRedis } from '../redis';

/**
 * Proof minutes (ADR 0031): the real time engines run in a learner's sessions, as the session
 * host reports it, counted per 24 hours from the first use. Kept in Redis like the Drill run
 * quota, and separate from it.
 */

const key = (userId: string) => `praman:proof-seconds:${userId}`;

// Add the seconds and start the 24-hour window on the first use, in one round trip.
const SPEND_SCRIPT = `
local used = redis.call('INCRBYFLOAT', KEYS[1], ARGV[1])
if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return used
`;

/** Proof seconds the learner has left today of their level's `dailySeconds`. */
export async function secondsLeft(userId: string, dailySeconds: number): Promise<number> {
  const used = z.coerce.number().parse((await getRedis().get(key(userId))) ?? 0);
  return Math.max(0, dailySeconds - used);
}

/** Counts engine seconds the session host reported against the learner's day. */
export async function spendSeconds(userId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  await getRedis().eval(SPEND_SCRIPT, 1, key(userId), String(seconds), String(DAY_MS));
}
