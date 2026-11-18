import 'server-only';
import {
  PublicIdSchema,
  type RunInput,
  type RunView,
  dailyRunQuota,
  drillSolved,
  meetsTarget,
} from '@siliconbox/shared';
import { type DrillForRun, findPublishedDrillForRun } from '@/db/content';
import { findEntitlements } from '@/db/entitlements';
import {
  type RunRecord,
  findCachedResult,
  findRun,
  findRunByRequest,
  finishRun,
  insertRun,
  saveCachedResult,
  saveGrading,
  updateRunState,
} from '@/db/runs';
import type { Identity } from './auth/authenticate';
import { jobHash, solverJob } from './drill-jobs';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { advanceGrading, gradingView, startGrading } from './grading';
import { redisRateLimiter } from './rate-limit';
import { readJob, submitJob } from './solver-client';

const DAY_MS = 24 * 60 * 60 * 1000;

function toView(run: RunRecord): RunView {
  const grading = gradingView(run.grading);
  return {
    id: run.publicId,
    drillId: run.drillId,
    state: run.state,
    position: run.position,
    result: run.result,
    grading,
    solved: drillSolved(run.target, run.result?.status ?? null, grading),
    createdAt: run.createdAt.toISOString(),
  };
}

async function requireDrill(drillId: string): Promise<DrillForRun> {
  const id = PublicIdSchema.safeParse(drillId);
  const drill = id.success ? await findPublishedDrillForRun(id.data) : null;
  if (drill === null) throw new AppError('NOT_FOUND', `no published drill ${drillId}`);
  return drill;
}

/** Runs per day follow the learner's highest active level; refused once used up. */
async function spendDailyRun(identity: Identity, now: Date): Promise<void> {
  const quota = dailyRunQuota(await findEntitlements(identity.userId), now);
  const policy = { name: 'drill-runs-daily', limit: quota, windowMs: DAY_MS };
  const { allowed } = await redisRateLimiter(`user:${identity.userId}`, policy);
  if (!allowed) throw new AppError('RUN_QUOTA_REACHED', `daily runs used by ${identity.userId}`);
}

function newRun(identity: Identity, drill: DrillForRun, input: RunInput, hash: string) {
  return {
    publicId: crypto.randomUUID(),
    userId: identity.userId,
    drillId: drill.publicId,
    requestId: input.requestId,
    target: drill.target,
    hash,
    properties: input.properties,
    grading: null,
    createdAt: new Date(),
  };
}

/**
 * Moves a finished run on to grading (ADR 0021): once the visible design gives the target, the
 * hidden designs are queued; afterwards their answers are collected as they arrive.
 */
async function settleGrading(run: RunRecord, drill?: DrillForRun): Promise<RunRecord> {
  if (run.result === null || !meetsTarget(run.target, run.result.status)) return run;
  const grading =
    run.grading === null
      ? await startGrading(run.userId, drill ?? (await requireDrill(run.drillId)), run.properties)
      : await advanceGrading(run.userId, run.grading);
  if (JSON.stringify(grading) !== JSON.stringify(run.grading)) {
    await saveGrading(run.publicId, grading);
  }
  return { ...run, grading };
}

/** Takes the visible job's answer from the solver once it is done, and stores it for good. */
async function settleVisible(run: RunRecord): Promise<RunRecord> {
  if (run.state === 'done' || run.jobId === null) return run;
  const job = await readJob(run.userId, run.jobId);
  if (job.state === 'done' && job.result !== null) {
    await finishRun(run.publicId, job.result);
    await saveCachedResult(run.hash, job.result);
    return { ...run, state: 'done', position: null, result: job.result };
  }
  await updateRunState(run.publicId, job.state, job.position);
  return { ...run, state: job.state, position: job.position };
}

/**
 * Starts a run: checks content and tool access for the Drill's level, answers identical code
 * from the cache, otherwise spends one of today's runs and queues the job on the solver.
 */
export async function startRun(
  identity: Identity,
  drillId: string,
  input: RunInput,
  now: Date = new Date(),
): Promise<RunView> {
  const drill = await requireDrill(drillId);
  await assertEntitled({ kind: 'drill', level: drill.level }, identity, now);
  const retried = await findRunByRequest(identity.userId, input.requestId);
  if (retried !== null) return toView(retried);

  const job = solverJob(drill, input.properties);
  const base = newRun(identity, drill, input, jobHash(job));
  const cached = await findCachedResult(base.hash);
  if (cached !== null) {
    const run: RunRecord = {
      ...base,
      jobId: null,
      state: 'done',
      position: null,
      result: cached,
      cached: true,
    };
    await insertRun(run);
    return toView(await settleGrading(run, drill));
  }

  await spendDailyRun(identity, now);
  const queued = await submitJob(identity.userId, job);
  const run: RunRecord = {
    ...base,
    jobId: queued.id,
    state: queued.state,
    position: queued.position,
    result: null,
    cached: false,
  };
  await insertRun(run);
  return toView(run);
}

/** The learner's own run, moved on from the solver and grading until both are finished. */
export async function readRun(identity: Identity, runId: string): Promise<RunView> {
  const id = PublicIdSchema.safeParse(runId);
  const run = id.success ? await findRun(identity.userId, id.data) : null;
  if (run === null) throw new AppError('NOT_FOUND', `no run ${runId} for ${identity.userId}`);
  return toView(await settleGrading(await settleVisible(run)));
}
