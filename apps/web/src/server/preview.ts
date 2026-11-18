import 'server-only';
import { type PublishedLesson, PublishedLessonSchema } from '@siliconbox/shared';
import { cmsAdminSession } from './cms-admin';
import { withResolvedLinks } from './lessons';

/**
 * The latest draft of a lesson, for a signed-in CMS admin only. Uses Payload's own session and
 * access rules, so a learner or a visitor gets null and the page shows "not found".
 */
export async function readLessonPreview(
  cmsId: string,
): Promise<{ lesson: PublishedLesson; adminEmail: string } | null> {
  const session = await cmsAdminSession();
  if (session === null) return null;
  const { payload, user } = session;
  const draft = await payload
    .findByID({
      collection: 'lessons',
      id: cmsId,
      draft: true,
      depth: 0,
      overrideAccess: false,
      user,
    })
    .catch(() => null);
  if (draft === null) return null;
  const lesson = PublishedLessonSchema.parse(draft);
  return {
    lesson: { ...lesson, blocks: await withResolvedLinks(lesson.blocks) },
    adminEmail: user.email,
  };
}
