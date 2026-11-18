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
  const found = id.success ? await findPublishedDrill(id.data) : null;
  if (found === null) throw new AppError('NOT_FOUND', `no published drill ${drillId}`);

  await assertEntitled({ kind: 'drillBrief', level: found.level }, identity, now);
  const canRun = await isEntitled({ kind: 'drill', level: found.level }, identity, now);
  const brief = markBlocks(found.drill.brief, learnerMarkCode(identity.userId));
  return { drill: { ...found.drill, brief }, canRun };
}
