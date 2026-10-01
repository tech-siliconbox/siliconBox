import 'server-only';
import { type LessonBlock, type PublishedLesson, PublicIdSchema } from '@siliconbox/shared';
import { findPublishedLesson } from '@/db/content';
import type { Identity } from './auth/authenticate';
import { getConfig } from './config';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { embedMark, markCode } from './invisible-mark';
import { log } from './log';
import { RATE_LIMITS, enforceRateLimit, redisRateLimiter } from './rate-limit';

/**
 * One published lesson for one learner: paced, checked against their entitlements on every
 * read, and carrying their invisible mark. Used by the lesson page and the lesson API.
 */
export async function readLesson(
  identity: Identity,
  lessonId: string,
  now: Date = new Date(),
): Promise<PublishedLesson> {
  await enforcePacing(identity.userId);
  const id = PublicIdSchema.safeParse(lessonId);
  if (!id.success) throw new AppError('NOT_FOUND', 'malformed lesson id');
  const found = await findPublishedLesson(id.data);
  if (found === null) throw new AppError('NOT_FOUND', `no published lesson ${id.data}`);

  const resource = { kind: 'lesson', level: found.level, isPreview: found.lesson.preview } as const;
  await assertEntitled(resource, identity, now);
  return markLesson(found.lesson, markCode(identity.userId, getConfig().BETTER_AUTH_SECRET));
}

/** About a dozen reads a minute and a daily cap. Hitting the cap soft-locks and raises an alert. */
async function enforcePacing(userId: string): Promise<void> {
  const key = `user:${userId}`;
  await enforceRateLimit(redisRateLimiter, key, RATE_LIMITS.contentRead);
  await enforceRateLimit(redisRateLimiter, key, RATE_LIMITS.contentReadDaily).catch(
    (error: unknown) => {
      log('warn', 'alert_content_daily_cap_reached', { userId });
      throw error;
    },
  );
}

/** Hides the learner's code in every passage of prose; code samples stay untouched. */
export function markLesson(lesson: PublishedLesson, code: number): PublishedLesson {
  return { ...lesson, blocks: lesson.blocks.map((block) => markBlock(block, code)) };
}

function markBlock(block: LessonBlock, code: number): LessonBlock {
  return block.blockType === 'paragraph' || block.blockType === 'callout'
    ? { ...block, text: embedMark(block.text, code) }
    : block;
}
