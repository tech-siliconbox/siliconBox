import 'server-only';
import { ASSESSMENT_ATTEMPTS } from '@siliconbox/shared';
import { MongoServerError } from 'mongodb';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

const DUPLICATE_KEY = 11000;

const AttemptSchema = z.object({ answers: z.array(z.number()), score: z.number(), at: z.date() });
export type Attempt = z.infer<typeof AttemptSchema>;
const RecordSchema = z.object({ assessmentId: z.string(), attempts: z.array(AttemptSchema) });
type AttemptsDocument = z.infer<typeof RecordSchema> & { userId: string };

// One document per learner and assessment, holding every attempt in order.
const attempts = () => getDb().collection<AttemptsDocument>(COLLECTIONS.assessmentAttempts);

/** A learner's attempts at one assessment, oldest first. */
export async function findAttempts(userId: string, assessmentId: string): Promise<Attempt[]> {
  const found = await attempts().findOne(
    { userId, assessmentId },
    { projection: { _id: 0, assessmentId: 1, attempts: 1 } },
  );
  return found === null ? [] : RecordSchema.parse(found).attempts;
}

/** Every assessment the learner tried, with their attempts: for Performance and their data. */
export async function findAllAttempts(userId: string) {
  const found = await attempts()
    .find({ userId }, { projection: { _id: 0, assessmentId: 1, attempts: 1 } })
    .toArray();
  return found.map((record) => RecordSchema.parse(record));
}

/**
 * Adds an attempt unless the learner has used every one, in one write, so two submissions at
 * once cannot both get through. False when no attempt was left.
 */
export async function recordAttempt(
  userId: string,
  assessmentId: string,
  attempt: Attempt,
): Promise<boolean> {
  try {
    await attempts().updateOne(
      { userId, assessmentId, [`attempts.${ASSESSMENT_ATTEMPTS - 1}`]: { $exists: false } },
      { $push: { attempts: attempt } },
      { upsert: true },
    );
    return true;
  } catch (error) {
    // The filter did not match the full document, so the upsert hit the unique index.
    if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
    throw error;
  }
}
