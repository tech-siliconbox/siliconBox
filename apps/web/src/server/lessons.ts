import 'server-only';
import { type LessonBlock, type PublishedLesson, SlugSchema } from '@siliconbox/shared';
import { type PublishedLessonInCourse, findLessonCourses, findPublishedLesson } from '@/db/content';
import { linkedLessonSlugs, resolveCourseLinks } from './course-html';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { enforceReadPacing, learnerMarkCode, markBlocks } from './paid-content';
import { createTtlCache } from './ttl-cache';

/**
 * One published lesson for one learner, with its course: paced, checked against their
 * entitlements on every read, and carrying their invisible mark.
 */
export async function readLesson(
  identity: Identity,
  { course, lesson }: { course: string; lesson: string },
  now: Date = new Date(),
): Promise<PublishedLessonInCourse> {
  await enforceReadPacing(identity.userId);
  const slug = SlugSchema.safeParse(lesson);
  const found = slug.success ? await findPublishedLessonCached(slug.data) : null;
  // The address names the course too; a lesson under another course's address is not found.
  if (found?.courseSlug !== course) {
    throw new AppError('NOT_FOUND', `no published lesson ${course}/${lesson}`);
  }

  const resource = { kind: 'lesson', level: found.level, isPreview: found.lesson.preview } as const;
  await assertEntitled(resource, identity, now);
  return { ...found, lesson: markLesson(found.lesson, learnerMarkCode(identity.userId)) };
}

/** Links in the author's markup point at lessons by slug; resolve them once per cached copy. */
export async function withResolvedLinks(blocks: LessonBlock[]): Promise<LessonBlock[]> {
  const html = blocks.flatMap((block) => (block.blockType === 'html' ? [block.html] : []));
  if (html.length === 0) return blocks;
  const lessonCourses = await findLessonCourses(html.flatMap(linkedLessonSlugs));
  return blocks.map((block) =>
    block.blockType === 'html'
      ? { ...block, html: resolveCourseLinks(block.html, lessonCourses) }
      : block,
  );
}

// docs/architecture/content-delivery.md: keep a published lesson 30 to 60 seconds in memory.
// Only the content is cached: pacing, the entitlement check and the watermark run every read.
const LESSON_CACHE_MS = 30_000;
const publishedLessons = createTtlCache<PublishedLessonInCourse>(LESSON_CACHE_MS);

async function findPublishedLessonCached(slug: string) {
  const cached = publishedLessons.get(slug);
  if (cached !== undefined) return cached;
  const found = await findPublishedLesson({ slug });
  // Misses are not cached, so a newly published lesson is readable at once.
  if (found === null) return null;
  const prepared = {
    ...found,
    lesson: { ...found.lesson, blocks: await withResolvedLinks(found.lesson.blocks) },
  };
  publishedLessons.set(slug, prepared);
  return prepared;
}

/** Called when content is published or changed, so this instance serves the new version at once. */
export function clearLessonCache(): void {
  publishedLessons.clear();
}

export function markLesson(lesson: PublishedLesson, code: number): PublishedLesson {
  return { ...lesson, blocks: markBlocks(lesson.blocks, code) };
}
