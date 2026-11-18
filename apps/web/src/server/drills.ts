import 'server-only';
import { type PublishedDrill, PublicIdSchema } from '@siliconbox/shared';
import { findPublishedDrill } from '@/db/content';
import type { Identity } from './auth/authenticate';
import { assertEntitled, isEntitled } from './entitlements';
import { AppError } from './errors';
import { enforceReadPacing, learnerMarkCode, markBlocks } from './paid-content';

export type DrillPage = { drill: PublishedDrill; canRun: boolean };

/**
 * One published Drill for one learner: paced like a lesson, readable with content access for
 * its level, runnable only with tool access too. The brief carries the learner's mark.
 */
export async function readDrill(
  identity: Identity,
  drillId: string,
  now: Date = new Date(),
): Promise<DrillPage> {
  await enforceReadPacing(identity.userId);
  const id = PublicIdSchema.safeParse(drillId);
  const found = id.success ? await findPublishedDrill({ publicId: id.data }) : null;
  if (found === null) throw new AppError('NOT_FOUND', `no published drill ${drillId}`);
  return drillPage(identity, found, now);
}

async function drillPage(
  identity: Identity,
  found: NonNullable<Awaited<ReturnType<typeof findPublishedDrill>>>,
  now: Date,
): Promise<DrillPage> {
  await assertEntitled({ kind: 'drillBrief', level: found.level }, identity, now);
  const canRun = await isEntitled({ kind: 'drill', level: found.level }, identity, now);
  const brief = markBlocks(found.drill.brief, learnerMarkCode(identity.userId));
  return { drill: { ...found.drill, brief }, canRun };
}

/**
 * A Drill embedded in a lesson the learner is reading (after a lab). The lesson read already
 * counted against pacing; the Drill still needs content access for its own level. Null when it
 * is not published or not open to this learner, so the lesson simply leaves it out.
 */
export async function readEmbeddedDrill(
  identity: Identity,
  slug: string,
  now: Date = new Date(),
): Promise<DrillPage | null> {
  const found = await findPublishedDrill({ slug });
  if (found === null) return null;
  return drillPage(identity, found, now).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_ENTITLED') return null;
    throw error;
  });
}
