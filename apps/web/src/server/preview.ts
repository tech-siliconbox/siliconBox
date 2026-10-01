import 'server-only';
import config from '@payload-config';
import { type PublishedLesson, PublishedLessonSchema } from '@siliconbox/shared';
import { headers } from 'next/headers';
import { getPayload } from 'payload';

/**
 * The latest draft of a lesson, for a signed-in CMS admin only. Uses Payload's own session and
 * access rules, so a learner or a visitor gets null and the page shows "not found".
 */
export async function readLessonPreview(
  cmsId: string,
): Promise<{ lesson: PublishedLesson; adminEmail: string } | null> {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (user?.collection !== 'admins') return null;
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
  return { lesson: PublishedLessonSchema.parse(draft), adminEmail: user.email };
}
