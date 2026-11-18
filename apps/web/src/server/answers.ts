import 'server-only';
import { type LessonBlock, SlugSchema } from '@siliconbox/shared';
import { findPublishedAnswerBlocks, findPublishedQuestion } from '@/db/answers';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { enforceReadPacing, learnerMarkCode, markBlocks } from './paid-content';

export type QuestionAnswer = { question: string; blocks: LessonBlock[] };

/**
 * A question's answer for one learner: paced like lessons, allowed only with an active content
 * entitlement (access model), read only after that check, and carrying the invisible mark.
 */
export async function readAnswer(
  identity: Identity,
  questionSlug: string,
): Promise<QuestionAnswer> {
  await enforceReadPacing(identity.userId);
  const slug = SlugSchema.safeParse(questionSlug);
  const question = slug.success ? await findPublishedQuestion(slug.data) : null;
  if (question === null) throw new AppError('NOT_FOUND', `no published question ${questionSlug}`);

  await assertEntitled({ kind: 'answer' }, identity);
  const blocks = await findPublishedAnswerBlocks(question.id);
  if (blocks === null) throw new AppError('NOT_FOUND', `no published answer for ${questionSlug}`);
  return { question: question.text, blocks: markBlocks(blocks, learnerMarkCode(identity.userId)) };
}
