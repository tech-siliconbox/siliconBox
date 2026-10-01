import 'server-only';
import type { LessonBlock } from '@siliconbox/shared';
import { raiseAlert } from './alerts';
import { getConfig } from './config';
import { embedMark, markCode } from './invisible-mark';
import { RATE_LIMITS, enforceRateLimit, redisRateLimiter } from './rate-limit';

// What every paid read (lessons, question answers) shares: pacing and the invisible mark.

/** About a dozen reads a minute and a daily cap. Hitting the cap soft-locks and raises an alert. */
export async function enforceReadPacing(userId: string): Promise<void> {
  const key = `user:${userId}`;
  await enforceRateLimit(redisRateLimiter, key, RATE_LIMITS.contentRead);
  await enforceRateLimit(redisRateLimiter, key, RATE_LIMITS.contentReadDaily).catch(
    async (error: unknown) => {
      await raiseAlert('content_daily_cap', userId);
      throw error;
    },
  );
}

export function learnerMarkCode(userId: string): number {
  return markCode(userId, getConfig().BETTER_AUTH_SECRET);
}

/** Hides the learner's code in every passage of prose; code samples stay untouched. */
export function markBlocks(blocks: LessonBlock[], code: number): LessonBlock[] {
  return blocks.map((block) =>
    block.blockType === 'paragraph' || block.blockType === 'callout'
      ? { ...block, text: embedMark(block.text, code) }
      : block,
  );
}
