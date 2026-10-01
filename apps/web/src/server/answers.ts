import 'server-only';
import { type LessonBlock, PublicIdSchema } from '@siliconbox/shared';
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
export async function readAnswer(identity: Identity, questionId: string): Promise<QuestionAnswer> {
  await enforceReadPacing(identity.userId);
  const id = PublicIdSchema.safeParse(questionId);
  if (!id.success) throw new AppError('NOT_FOUND', 'malformed question id');
  const question = await findPublishedQuestion(id.data);
  if (question === null) throw new AppError('NOT_FOUND', `no published question ${id.data}`);

  await assertEntitled({ kind: 'answer' }, identity);
  const blocks = await findPublishedAnswerBlocks(question.id);
  if (blocks === null) throw new AppError('NOT_FOUND', `no published answer for ${id.data}`);
  return { question: question.text, blocks: markBlocks(blocks, learnerMarkCode(identity.userId)) };
}
