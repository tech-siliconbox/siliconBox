import 'server-only';
import type { CourseOutline, ProgressInput } from '@siliconbox/shared';
import { findPublishedLesson } from '@/db/content';
import { findDoneLessonIds, setLessonDone } from '@/db/progress';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';

/** Marks a lesson done or not done, only for a published lesson the learner may read. */
export async function recordProgress(identity: Identity, input: ProgressInput): Promise<void> {
  const found = await findPublishedLesson({ publicId: input.lessonId });
  if (found === null) throw new AppError('NOT_FOUND', `no published lesson ${input.lessonId}`);
  await assertEntitled(
    { kind: 'lesson', level: found.level, isPreview: found.lesson.preview },
    identity,
  );
  await setLessonDone(identity.userId, input.lessonId, input.done);
}

/** The lessons of a course this learner has marked done; none for a visitor. */
export async function findDoneInCourse(
  identity: Identity | null,
  course: CourseOutline,
): Promise<Set<string>> {
  if (identity === null) return new Set();
  const lessonIds = course.modules.flatMap((module) =>
    module.lessons.map(({ publicId }) => publicId),
  );
  return findDoneLessonIds(identity.userId, lessonIds);
}
