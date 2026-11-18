import 'server-only';
import type { Level } from '@siliconbox/shared';
import { findCourseOutlines } from '@/db/content';
import type { Identity } from './auth/authenticate';
import { isEntitled } from './entitlements';
import { AppError } from './errors';
import { findDoneInCourse } from './progress';

/**
 * A lesson's course for its module index: the outline (titles only), the lessons this learner
 * has done, and whether every lesson is open to them or only the free preview.
 */
export async function readCourseIndex(
  identity: Identity,
  { courseSlug, level }: { courseSlug: string; level: Level },
  now: Date = new Date(),
) {
  const [course] = await findCourseOutlines(courseSlug);
  if (course === undefined) throw new AppError('NOT_FOUND', `no published course ${courseSlug}`);
  const [doneLessonIds, fullAccess] = await Promise.all([
    findDoneInCourse(identity, course),
    isEntitled({ kind: 'lesson', level, isPreview: false }, identity, now),
  ]);
  return { course, doneLessonIds, fullAccess };
}
