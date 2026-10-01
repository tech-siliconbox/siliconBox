import 'server-only';
import { type LessonBlock, type PublishedLesson, PublicIdSchema } from '@siliconbox/shared';
import { findPublishedLesson } from '@/db/content';
import type { Identity } from './auth/authenticate';
import { getConfig } from './config';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { embedMark, markCode } from './invisible-mark';
import { raiseAlert } from './alerts';
import { RATE_LIMITS, enforceRateLimit, redisRateLimiter } from './rate-limit';
import { createTtlCache } from './ttl-cache';

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
  const found = await findPublishedLessonCached(id.data);
  if (found === null) throw new AppError('NOT_FOUND', `no published lesson ${id.data}`);

  const resource = { kind: 'lesson', level: found.level, isPreview: found.lesson.preview } as const;
  await assertEntitled(resource, identity, now);
  return markLesson(found.lesson, markCode(identity.userId, getConfig().BETTER_AUTH_SECRET));
}

// docs/architecture/content-delivery.md: keep a published lesson 30 to 60 seconds in memory.
// Only the content is cached: pacing, the entitlement check and the watermark run every read.
const LESSON_CACHE_MS = 30_000;
const publishedLessons =
  createTtlCache<NonNullable<Awaited<ReturnType<typeof findPublishedLesson>>>>(LESSON_CACHE_MS);

async function findPublishedLessonCached(publicId: string) {
  const cached = publishedLessons.get(publicId);
  if (cached !== undefined) return cached;
  const found = await findPublishedLesson(publicId);
  // Misses are not cached, so a newly published lesson is readable at once.
  if (found !== null) publishedLessons.set(publicId, found);
  return found;
}

/** Called when content is published or changed, so this instance serves the new version at once. */
export function clearLessonCache(): void {
  publishedLessons.clear();
}

/** About a dozen reads a minute and a daily cap. Hitting the cap soft-locks and raises an alert. */
async function enforcePacing(userId: string): Promise<void> {
  const key = `user:${userId}`;
  await enforceRateLimit(redisRateLimiter, key, RATE_LIMITS.contentRead);
  await enforceRateLimit(redisRateLimiter, key, RATE_LIMITS.contentReadDaily).catch(
    async (error: unknown) => {
      await raiseAlert('content_daily_cap', userId);
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
