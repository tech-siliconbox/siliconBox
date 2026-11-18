import 'server-only';
import { type PublishedLesson, PublishedLessonSchema } from '@siliconbox/shared';
import { cmsAdminSession } from './cms-admin';
import { withResolvedLinks } from './lessons';

/**
 * The latest draft of a lesson, for a signed-in CMS admin only. Uses Payload's own session and
 * access rules, so a learner or a visitor gets null and the page shows "not found".
 */
export async function readLessonPreview(
  slug: string,
): Promise<{ lesson: PublishedLesson; adminEmail: string } | null> {
  const session = await cmsAdminSession();
  if (session === null) return null;
  const { payload, user } = session;
  const { docs } = await payload
    .find({
      collection: 'lessons',
      where: { slug: { equals: slug } },
      limit: 1,
      draft: true,
      depth: 0,
      overrideAccess: false,
      user,
    })
    .catch(() => ({ docs: [] }));
  const [draft] = docs;
  if (draft === undefined) return null;
  const lesson = PublishedLessonSchema.parse(draft);
  return {
    lesson: { ...lesson, blocks: await withResolvedLinks(lesson.blocks) },
    adminEmail: user.email,
  };
}
