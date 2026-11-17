import 'server-only';
import { createHash } from 'node:crypto';
import type { DrillForRun } from '@/db/content';
import type { SolverJob } from './solver-client';

/**
 * The learner's code against a design, with the Drill's own settings (CLAUDE.md rule 6). The
 * design is the Drill's visible one, or a hidden one when grading (ADR 0021).
 */
export function solverJob(
  drill: DrillForRun,
  properties: string,
  design: string = drill.designCode,
): SolverJob {
  return {
    design,
    properties,
    settings: {
      mode: drill.mode,
      solver: drill.solver,
      depth: drill.depth,
      timeoutSeconds: drill.timeoutSeconds,
      topModule: design.trim() === '' ? null : drill.topModule,
    },
  };
}

/** Same code, same design and settings: same answer (the key of `run_cache`). */
export function jobHash(job: SolverJob): string {
  return createHash('sha256').update(JSON.stringify(job)).digest('hex');
}
