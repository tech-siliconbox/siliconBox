import 'server-only';
import { z } from 'zod';
import { AppError } from './errors';
import { getRedis } from './redis';

export type RateLimitPolicy = { name: string; limit: number; windowMs: number };
type RateLimitResult = { allowed: boolean; retryAfterMs: number };
export type RateLimiter = (key: string, policy: RateLimitPolicy) => Promise<RateLimitResult>;

/** Per-route budgets. Cloudflare applies coarser limits at the edge before these. */
export const RATE_LIMITS = {
  authWrite: { name: 'auth-write', limit: 10, windowMs: 60_000 },
  read: { name: 'read', limit: 120, windowMs: 60_000 },
  write: { name: 'write', limit: 30, windowMs: 60_000 },
  // Parsing a CV is CPU work; a learner rarely needs more than a few runs an hour.
  cvScreen: { name: 'cv-screen', limit: 10, windowMs: 60 * 60 * 1000 },
  // Checking a resume builds its PDF and reads it back; learners re-check while they edit.
  resumeCheck: { name: 'resume-check', limit: 20, windowMs: 60 * 60 * 1000 },
  // Asking for AI help: a burst limit; the learner's daily and monthly allowance sits on top.
  aiRequest: { name: 'ai-request', limit: 10, windowMs: 60 * 60 * 1000 },
  // Importing a resume reads a file (a LinkedIn export is a zip); a few an hour is plenty.
  resumeImport: { name: 'resume-import', limit: 10, windowMs: 60 * 60 * 1000 },
  // Starting a Drill run queues solver work; the daily quota per level sits on top of this.
  runStart: { name: 'run-start', limit: 6, windowMs: 60_000 },
  // docs/architecture/content-delivery.md: about a dozen lesson reads a minute per account.
  contentRead: { name: 'content-read', limit: 12, windowMs: 60_000 },
  // A daily cap per account; the number is a starting point to tune from real reading data.
  contentReadDaily: { name: 'content-read-daily', limit: 150, windowMs: 24 * 60 * 60 * 1000 },
  // Each photo is decoded and re-encoded on the server.
  photoUpload: { name: 'photo-upload', limit: 10, windowMs: 60 * 60 * 1000 },
  // A capstone is a .zip of up to 10 MB; a few uploads an hour covers fixing a wrong file.
  capstoneUpload: { name: 'capstone-upload', limit: 10, windowMs: 60 * 60 * 1000 },
  // A learner's data download reads every collection about them; a few an hour is plenty.
  dataExport: { name: 'data-export', limit: 5, windowMs: 60 * 60 * 1000 },
  // Admins tracing leaked text: a handful an hour is plenty, and it bounds lookups of learners.
  watermarkTrace: { name: 'watermark-trace', limit: 20, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

/** Throws RATE_LIMITED, with Retry-After, once `key` has used up the policy's window. */
export async function enforceRateLimit(
  limiter: RateLimiter,
  key: string,
  policy: RateLimitPolicy,
): Promise<void> {
  const { allowed, retryAfterMs } = await limiter(key, policy);
  if (!allowed) {
    const retryAfter = String(Math.ceil(retryAfterMs / 1000));
    throw new AppError('RATE_LIMITED', `${policy.name} for ${key}`, { 'Retry-After': retryAfter });
  }
}

// Fixed window in one round trip, so each request costs a single Redis command.
const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;
const ScriptResultSchema = z.tuple([z.number(), z.number()]);
const windowKey = (key: string, policy: RateLimitPolicy) => `rl:${policy.name}:${key}`;

// Gives one use back, never below zero and never to a window that has already ended.
const RELEASE_SCRIPT = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count > 0 then return redis.call('DECR', KEYS[1]) end
return 0
`;

/** Gives back one use of `policy` for `key`, when the work it paid for failed. */
export async function releaseRateLimit(key: string, policy: RateLimitPolicy): Promise<void> {
  await getRedis().eval(RELEASE_SCRIPT, 1, windowKey(key, policy));
}

export const redisRateLimiter: RateLimiter = async (key, policy) => {
  const raw = await getRedis().eval(
    FIXED_WINDOW_SCRIPT,
    1,
    windowKey(key, policy),
    policy.windowMs,
  );
  const [count, ttlMs] = ScriptResultSchema.parse(raw);
  const allowed = count <= policy.limit;
  return { allowed, retryAfterMs: allowed ? 0 : Math.max(ttlMs, 0) };
};
