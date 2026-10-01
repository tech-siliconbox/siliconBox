import 'server-only';
import type { ProgressInput } from '@siliconbox/shared';
import { findPublishedLesson } from '@/db/content';
import { setLessonDone } from '@/db/progress';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';

/** Marks a lesson done or not done, only for a published lesson the learner may read. */
export async function recordProgress(identity: Identity, input: ProgressInput): Promise<void> {
  const found = await findPublishedLesson(input.lessonId);
  if (found === null) throw new AppError('NOT_FOUND', `no published lesson ${input.lessonId}`);
  await assertEntitled(
    { kind: 'lesson', level: found.level, isPreview: found.lesson.preview },
    identity,
  );
  await setLessonDone(identity.userId, input.lessonId, input.done);
}
