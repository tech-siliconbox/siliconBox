import 'server-only';
import { type LessonBlock, type PublishedLesson, PublicIdSchema } from '@siliconbox/shared';
import {
  type PublishedLessonWithLevel,
  findLessonPublicIds,
  findPublishedLesson,
} from '@/db/content';
import { linkedLessonSlugs, resolveCourseLinks } from './course-html';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { enforceReadPacing, learnerMarkCode, markBlocks } from './paid-content';
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
  await enforceReadPacing(identity.userId);
  const id = PublicIdSchema.safeParse(lessonId);
  if (!id.success) throw new AppError('NOT_FOUND', 'malformed lesson id');
  const found = await findPublishedLessonCached(id.data);
  if (found === null) throw new AppError('NOT_FOUND', `no published lesson ${id.data}`);

  const resource = { kind: 'lesson', level: found.level, isPreview: found.lesson.preview } as const;
  await assertEntitled(resource, identity, now);
  return markLesson(found.lesson, learnerMarkCode(identity.userId));
}

/** Links in the author's markup point at lessons by slug; resolve them once per cached copy. */
export async function withResolvedLinks(blocks: LessonBlock[]): Promise<LessonBlock[]> {
  const html = blocks.flatMap((block) => (block.blockType === 'html' ? [block.html] : []));
  if (html.length === 0) return blocks;
  const lessonIds = await findLessonPublicIds(html.flatMap(linkedLessonSlugs));
  return blocks.map((block) =>
    block.blockType === 'html'
      ? { ...block, html: resolveCourseLinks(block.html, lessonIds) }
      : block,
  );
}

// docs/architecture/content-delivery.md: keep a published lesson 30 to 60 seconds in memory.
// Only the content is cached: pacing, the entitlement check and the watermark run every read.
const LESSON_CACHE_MS = 30_000;
const publishedLessons = createTtlCache<PublishedLessonWithLevel>(LESSON_CACHE_MS);

async function findPublishedLessonCached(publicId: string) {
  const cached = publishedLessons.get(publicId);
  if (cached !== undefined) return cached;
  const found = await findPublishedLesson(publicId);
  // Misses are not cached, so a newly published lesson is readable at once.
  if (found === null) return null;
  const prepared = {
    ...found,
    lesson: { ...found.lesson, blocks: await withResolvedLinks(found.lesson.blocks) },
  };
  publishedLessons.set(publicId, prepared);
  return prepared;
}

/** Called when content is published or changed, so this instance serves the new version at once. */
export function clearLessonCache(): void {
  publishedLessons.clear();
}

export function markLesson(lesson: PublishedLesson, code: number): PublishedLesson {
  return { ...lesson, blocks: markBlocks(lesson.blocks, code) };
}
