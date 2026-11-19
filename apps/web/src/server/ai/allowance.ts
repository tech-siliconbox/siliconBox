import 'server-only';
import { AI_FEEDBACK_LIMITS, DAY_MS } from '@siliconbox/shared';
import { AppError } from '../errors';
import { type RateLimitPolicy, redisRateLimiter, releaseRateLimit } from '../rate-limit';

// Each learner's AI allowance, shared by every AI feature (ADR 0030): a use is taken before the
// call to the provider and given back when the call fails.

const POLICIES: readonly RateLimitPolicy[] = [
  { name: 'ai-allowance-day', limit: AI_FEEDBACK_LIMITS.perDay, windowMs: DAY_MS },
  { name: 'ai-allowance-30d', limit: AI_FEEDBACK_LIMITS.perMonth, windowMs: 30 * DAY_MS },
];

const keyOf = (userId: string) => `user:${userId}`;

/** Takes one use from the day's and the month's allowance, or refuses without taking any. */
export async function spendAiAllowance(userId: string): Promise<void> {
  const taken: RateLimitPolicy[] = [];
  for (const policy of POLICIES) {
    taken.push(policy);
    const { allowed } = await redisRateLimiter(keyOf(userId), policy);
    if (!allowed) {
      await Promise.all(taken.map((spent) => releaseRateLimit(keyOf(userId), spent)));
      throw new AppError('AI_QUOTA_REACHED', `${policy.name} used by ${userId}`);
    }
  }
}

/** Gives the use back after the call it paid for failed. */
export async function refundAiAllowance(userId: string): Promise<void> {
  await Promise.all(POLICIES.map((policy) => releaseRateLimit(keyOf(userId), policy)));
}
