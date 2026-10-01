import 'server-only';
import { createHash } from 'node:crypto';
import {
  PublicIdSchema,
  type RunInput,
  type RunView,
  dailyRunQuota,
  isDrillSolved,
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
  updateRunState,
} from '@/db/runs';
import type { Identity } from './auth/authenticate';
import { assertEntitled } from './entitlements';
import { AppError } from './errors';
import { redisRateLimiter } from './rate-limit';
import { type SolverJob, readJob, submitJob } from './solver-client';

const DAY_MS = 24 * 60 * 60 * 1000;

function toView(run: RunRecord): RunView {
  return {
    id: run.publicId,
    drillId: run.drillId,
    state: run.state,
    position: run.position,
    result: run.result,
    solved: run.result === null ? null : isDrillSolved(run.target, run.result.status),
    createdAt: run.createdAt.toISOString(),
  };
}

async function requireDrill(drillId: string): Promise<DrillForRun> {
  const id = PublicIdSchema.safeParse(drillId);
  const drill = id.success ? await findPublishedDrillForRun(id.data) : null;
  if (drill === null) throw new AppError('NOT_FOUND', `no published drill ${drillId}`);
  return drill;
}

/** The learner's code against the Drill's own design and settings (CLAUDE.md rule 6). */
function solverJob(drill: DrillForRun, properties: string): SolverJob {
  return {
    design: drill.designCode,
    properties,
    settings: {
      mode: drill.mode,
      solver: drill.solver,
      depth: drill.depth,
      timeoutSeconds: drill.timeoutSeconds,
      topModule: drill.designCode.trim() === '' ? null : drill.topModule,
    },
  };
}

/** Same code, same Drill design and settings: same answer. */
function jobHash(job: SolverJob): string {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex');
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
    createdAt: new Date(),
  };
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
  const hash = jobHash(job);
  const base = newRun(identity, drill, input, hash);
  const cached = await findCachedResult(hash);
  if (cached !== null) {
    const run = {
      ...base,
      jobId: null,
      state: 'done',
      position: null,
      result: cached,
      cached: true,
    } as const;
    await insertRun(run, input.properties);
    return toView(run);
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
  await insertRun(run, input.properties);
  return toView(run);
}

/** The learner's own run; refreshed from the solver until it finishes, then stored for good. */
export async function readRun(identity: Identity, runId: string): Promise<RunView> {
  const id = PublicIdSchema.safeParse(runId);
  const run = id.success ? await findRun(identity.userId, id.data) : null;
  if (run === null) throw new AppError('NOT_FOUND', `no run ${runId} for ${identity.userId}`);
  if (run.state === 'done' || run.jobId === null) return toView(run);

  const job = await readJob(identity.userId, run.jobId);
  if (job.state === 'done' && job.result !== null) {
    await finishRun(run.publicId, job.result);
    await saveCachedResult(run.hash, job.result);
    return toView({ ...run, state: 'done', position: null, result: job.result });
  }
  await updateRunState(run.publicId, job.state, job.position);
  return toView({ ...run, state: job.state, position: job.position });
}
