import 'server-only';
import {
  DRILL_TARGETS,
  PublicIdSchema,
  RUN_STATES,
  type RunResult,
  RunResultSchema,
  type RunState,
} from '@siliconbox/shared';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** One learner's run of one Drill. The learner's code is kept so the workspace can reopen it. */
const RunRecordSchema = z.object({
  publicId: PublicIdSchema,
  userId: z.string(),
  drillId: PublicIdSchema,
  requestId: z.uuid(),
  target: z.enum(DRILL_TARGETS),
  hash: z.string(),
  jobId: z.uuid().nullable(),
  state: z.enum(RUN_STATES),
  position: z.number().int().nullable(),
  result: RunResultSchema.nullable(),
  cached: z.boolean(),
  createdAt: z.date(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;

const runs = () => getDb().collection(COLLECTIONS.runs);
const parse = (document: unknown) => RunRecordSchema.parse(document);
const PROJECTION = { projection: { _id: 0 } };

export async function insertRun(run: RunRecord, properties: string): Promise<void> {
  await runs().insertOne({ ...RunRecordSchema.parse(run), properties });
}

export async function findRun(userId: string, publicId: string): Promise<RunRecord | null> {
  const found = await runs().findOne({ userId, publicId }, PROJECTION);
  return found === null ? null : parse(found);
}

/** A retried submit (same request id) finds the run the first one started. */
export async function findRunByRequest(
  userId: string,
  requestId: string,
): Promise<RunRecord | null> {
  const found = await runs().findOne({ userId, requestId }, PROJECTION);
  return found === null ? null : parse(found);
}

export async function updateRunState(
  publicId: string,
  state: RunState,
  position: number | null,
): Promise<void> {
  await runs().updateOne({ publicId }, { $set: { state, position } });
}

export async function finishRun(publicId: string, result: RunResult): Promise<void> {
  await runs().updateOne(
    { publicId },
    { $set: { state: 'done', position: null, result, finishedAt: new Date() } },
  );
}

// run_cache: identical code for the same Drill is answered without the solver
// (solver-integration.md). Only PASS and FAIL are cached; TIMEOUT and ERROR may be passing faults.
const cache = () => getDb().collection(COLLECTIONS.runCache);

export async function findCachedResult(hash: string): Promise<RunResult | null> {
  const found = await cache().findOne({ hash }, PROJECTION);
  return found === null ? null : RunResultSchema.parse(found.result);
}

export async function saveCachedResult(hash: string, result: RunResult): Promise<void> {
  if (result.status !== 'PASS' && result.status !== 'FAIL') return;
  await cache().updateOne(
    { hash },
    { $setOnInsert: { hash, result, createdAt: new Date() } },
    { upsert: true },
  );
}
