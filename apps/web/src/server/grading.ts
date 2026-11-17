import 'server-only';
import type { DrillTarget, GradingView, RunStatus } from '@siliconbox/shared';
import type { DrillForRun } from '@/db/content';
import { type HiddenDesigns, findHiddenDesigns } from '@/db/grading';
import { type GradingRecord, findCachedResult, saveCachedResult } from '@/db/runs';
import { jobHash, solverJob } from './drill-jobs';
import { readJob, submitJob } from './solver-client';

// ADR 0021: a run that reaches the Drill's target is also run against the Drill's hidden
// designs. A PASS Drill's checker must fail on every seeded bug; a FAIL Drill's checker must
// hold on the correct design. Grading jobs do not use up the learner's daily runs.

type Planned = { design: string; expect: RunStatus & ('PASS' | 'FAIL') };

/** What to run, and what each hidden design must answer. */
export function gradingPlan(
  target: DrillTarget,
  hidden: HiddenDesigns | null,
): { kind: GradingRecord['kind']; planned: Planned[] } {
  if (target === 'PASS' && hidden !== null && hidden.bugVariants.length > 0) {
    const planned = hidden.bugVariants.map(({ code }) => ({
      design: code,
      expect: 'FAIL' as const,
    }));
    return { kind: 'bugVariants', planned };
  }
  if (target === 'FAIL' && hidden?.referenceDesign) {
    return { kind: 'correctDesign', planned: [{ design: hidden.referenceDesign, expect: 'PASS' }] };
  }
  return { kind: null, planned: [] };
}

/** Counts for the learner; never the hidden designs themselves. */
export function gradingView(record: GradingRecord | null): GradingView | null {
  if (!record?.kind) return null;
  const done = record.jobs.every((job) => job.status !== null);
  const met = record.jobs.filter((job) => job.status === job.expect).length;
  return { kind: record.kind, state: done ? 'done' : 'pending', total: record.jobs.length, met };
}

/** Queues one job per hidden design; identical jobs are answered from the run cache. */
export async function startGrading(
  userId: string,
  drill: DrillForRun,
  properties: string,
): Promise<GradingRecord> {
  const { kind, planned } = gradingPlan(drill.target, await findHiddenDesigns(drill.cmsId));
  const jobs = await Promise.all(
    planned.map(async ({ design, expect }) => {
      const job = solverJob(drill, properties, design);
      const hash = jobHash(job);
      const cached = await findCachedResult(hash);
      if (cached !== null) return { hash, expect, jobId: null, status: cached.status };
      const queued = await submitJob(userId, job);
      return { hash, expect, jobId: queued.id, status: null };
    }),
  );
  return { kind, jobs };
}

/** Collects the answers of grading jobs that have finished since the last look. */
export async function advanceGrading(
  userId: string,
  record: GradingRecord,
): Promise<GradingRecord> {
  const jobs = await Promise.all(
    record.jobs.map(async (job) => {
      if (job.status !== null || job.jobId === null) return job;
      const view = await readJob(userId, job.jobId);
      if (view.state !== 'done' || view.result === null) return job;
      await saveCachedResult(job.hash, view.result);
      return { ...job, status: view.result.status };
    }),
  );
  return { ...record, jobs };
}
