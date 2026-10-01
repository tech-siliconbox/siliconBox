import 'server-only';
import { type LessonBlock, LessonBlockSchema } from '@siliconbox/shared';
import { type Db, MongoClient } from 'mongodb';
import { z } from 'zod';
import { getConfig } from '@/server/config';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

// Paid answers live where the site's own database user cannot read them. This connection uses
// a user that may only read `answers`, and callers use it only after the entitlement check.

const globalForAnswers = globalThis as typeof globalThis & { siliconboxAnswers?: MongoClient };

function getAnswersDb(): Db {
  globalForAnswers.siliconboxAnswers ??= new MongoClient(getConfig().MONGODB_URI_ANSWERS, {
    appName: 'siliconbox-answers',
  });
  return globalForAnswers.siliconboxAnswers.db();
}

const PUBLISHED = 'published';
const BlocksSchema = z.object({ blocks: z.array(LessonBlockSchema) });

/** The public text of a published question, or null. */
export async function findPublishedQuestion(
  publicId: string,
): Promise<{ id: unknown; text: string } | null> {
  const question = await getDb()
    .collection(COLLECTIONS.questions)
    .findOne({ publicId, _status: PUBLISHED }, { projection: { _id: 1, text: 1 } });
  return question === null ? null : { id: question._id, text: String(question.text) };
}

/** The published answer blocks for a question, or null when none is published. */
export async function findPublishedAnswerBlocks(
  questionId: unknown,
): Promise<LessonBlock[] | null> {
  const answer = await getAnswersDb()
    .collection('answers')
    .findOne({ question: questionId, _status: PUBLISHED }, { projection: { _id: 0, blocks: 1 } });
  return answer === null ? null : BlocksSchema.parse(answer).blocks;
}
