import 'server-only';
import { CapstoneGradeSchema, PublicIdSchema } from '@siliconbox/shared';
import { Binary } from 'mongodb';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

const GradeSchema = CapstoneGradeSchema.omit({ submission: true }).extend({
  total: z.number(),
  passed: z.boolean(),
  gradedBy: z.string(),
  gradedAt: z.date(),
});
export type StoredGrade = z.infer<typeof GradeSchema>;

const SubmissionSchema = z.object({
  publicId: PublicIdSchema,
  userId: z.string(),
  capstoneId: PublicIdSchema,
  fileName: z.string(),
  size: z.number(),
  submittedAt: z.date(),
  status: z.enum(['submitted', 'graded']),
  grade: GradeSchema.nullable(),
});
export type Submission = z.infer<typeof SubmissionSchema>;

const submissions = () => getDb().collection(COLLECTIONS.capstoneSubmissions);
const files = () => getDb().collection(COLLECTIONS.capstoneFiles);
const WITHOUT_ID = { projection: { _id: 0 } } as const;
const NEWEST_FIRST = { submittedAt: -1 } as const;

/** A learner's submissions to one capstone, newest first. */
export async function findSubmissions(userId: string, capstoneId: string): Promise<Submission[]> {
  const found = await submissions()
    .find({ userId, capstoneId }, WITHOUT_ID)
    .sort(NEWEST_FIRST)
    .toArray();
  return found.map((submission) => SubmissionSchema.parse(submission));
}

/** Every submission of the learner, newest first: for Performance and their data. */
export async function findAllSubmissions(userId: string): Promise<Submission[]> {
  const found = await submissions().find({ userId }, WITHOUT_ID).sort(NEWEST_FIRST).toArray();
  return found.map((submission) => SubmissionSchema.parse(submission));
}

type Upload = { fileName: string; bytes: Uint8Array };

/**
 * Saves an upload as the learner's submission waiting for review: a new one, or in place of the
 * one already waiting (at most one waits per learner and capstone).
 */
export async function saveSubmission(
  userId: string,
  capstoneId: string,
  upload: Upload,
): Promise<void> {
  const waiting = await submissions().findOneAndUpdate(
    { userId, capstoneId, status: 'submitted' },
    {
      $set: { fileName: upload.fileName, size: upload.bytes.byteLength, submittedAt: new Date() },
      $setOnInsert: { publicId: crypto.randomUUID(), grade: null },
    },
    { upsert: true, returnDocument: 'after', projection: { _id: 0, publicId: 1 } },
  );
  const submissionId = String(waiting?.publicId);
  await files().updateOne(
    { submissionId },
    { $set: { userId, data: new Binary(upload.bytes) } },
    { upsert: true },
  );
}

const ReviewSchema = SubmissionSchema.extend({
  learnerEmail: z.string().nullish(),
  learnerName: z.string().nullish(),
});
export type SubmissionForReview = z.infer<typeof ReviewSchema>;

/** Submissions with their learner's name and email, for the experts who grade them. */
function withLearner(match: object, sort: object, limit: number) {
  return submissions()
    .aggregate([
      { $match: match },
      { $sort: sort },
      { $limit: limit },
      // An id that is not an account id matches nobody instead of failing the query.
      {
        $addFields: { learner: { $convert: { input: '$userId', to: 'objectId', onError: null } } },
      },
      {
        $lookup: {
          from: COLLECTIONS.users,
          localField: 'learner',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $addFields: {
          learnerEmail: { $first: '$user.email' },
          learnerName: { $first: '$user.name' },
        },
      },
      { $project: { _id: 0, learner: 0, user: 0 } },
    ])
    .toArray()
    .then((rows) => rows.map((row) => ReviewSchema.parse(row)));
}

const REVIEW_LIST_LIMIT = 100;

/** Submissions waiting for review, oldest first, then the latest graded ones. */
export async function listSubmissionsForReview(): Promise<SubmissionForReview[]> {
  const [waiting, graded] = await Promise.all([
    withLearner({ status: 'submitted' }, { submittedAt: 1 }, REVIEW_LIST_LIMIT),
    withLearner({ status: 'graded' }, { 'grade.gradedAt': -1 }, REVIEW_LIST_LIMIT),
  ]);
  return [...waiting, ...graded];
}

export async function findSubmissionForReview(
  publicId: string,
): Promise<SubmissionForReview | null> {
  const [found] = await withLearner({ publicId }, { submittedAt: -1 }, 1);
  return found ?? null;
}

/** The uploaded .zip, for an expert to download. */
export async function findSubmissionFile(
  submissionId: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const found = await files().findOne({ submissionId }, { projection: { _id: 0, data: 1 } });
  return found?.data instanceof Binary ? new Uint8Array(found.data.buffer) : null;
}

/** Records (or corrects) an expert's grade. */
export async function saveGrade(publicId: string, grade: StoredGrade): Promise<boolean> {
  const { matchedCount } = await submissions().updateOne(
    { publicId },
    { $set: { status: 'graded', grade } },
  );
  return matchedCount === 1;
}
