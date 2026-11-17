import { z } from 'zod';
import type { DrillTarget } from './drill';
import { PublicIdSchema } from './lesson';
import type { Level } from './level';

// A Run: one execution of a learner's properties on the solver for a Drill
// (docs/architecture/solver-integration.md). The solver's result shape is mirrored here so the
// web app validates every response it relays to the browser.

/** The solver refuses more than this (apps/solver/app/limits.py, MAX_PROPERTIES_BYTES). */
export const RUN_PROPERTIES_MAX_BYTES = 64 * 1024;

/**
 * Runs a learner may start per day, by the highest level they hold. Starting values, to tune
 * from real usage (solver-integration.md: "Basic gets fewer runs a day than Advance").
 */
export const DRILL_RUN_DAILY_QUOTA: Readonly<Record<Level, number>> = {
  basic: 40,
  intermediate: 80,
  advance: 150,
};

/** Body of `POST /api/v1/drills/:id/runs`. `requestId` makes a retried submit start one run. */
export const RunInputSchema = z.strictObject({
  properties: z
    .string()
    .min(1)
    .refine((code) => new TextEncoder().encode(code).length <= RUN_PROPERTIES_MAX_BYTES, {
      message: `Properties are over ${RUN_PROPERTIES_MAX_BYTES / 1024} KB`,
    }),
  requestId: z.uuid(),
});
export type RunInput = z.infer<typeof RunInputSchema>;

export const RUN_STATUSES = ['PASS', 'FAIL', 'TIMEOUT', 'ERROR'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

const TraceSignalSchema = z.object({
  name: z.string(),
  fullName: z.string(),
  width: z.number().int(),
  transitions: z.array(z.object({ time: z.number(), value: z.string() })),
});

/** A counterexample or cover witness, compact: one entry per signal with its value changes. */
export const TraceSchema = z.object({
  timescale: z.string(),
  endTime: z.number(),
  timepoints: z.array(z.number()),
  signals: z.array(TraceSignalSchema),
});
export type Trace = z.infer<typeof TraceSchema>;

export const CheckResultSchema = z.object({
  name: z.string(),
  kind: z.enum(['assert', 'cover']),
  status: z.enum([...RUN_STATUSES, 'SKIPPED']),
  step: z.number().int().nullable(),
  message: z.string(),
  trace: TraceSchema.nullable(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

export const RunResultSchema = z.object({
  status: z.enum(RUN_STATUSES),
  elapsedSeconds: z.number(),
  depthReached: z.number().int(),
  checks: z.array(CheckResultSchema),
  failedCheck: z.string().nullable(),
  failureCycle: z.number().int().nullable(),
  message: z.string(),
  log: z.string(),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const RUN_STATES = ['queued', 'running', 'done'] as const;
export type RunState = (typeof RUN_STATES)[number];

/**
 * Grading against the Drill's hidden designs (ADR 0021): the seeded bug variants of a PASS
 * Drill (each must make the learner's properties FAIL), or the correct design of a FAIL Drill
 * (it must PASS). Only counts reach the learner, never the hidden designs.
 */
export const GRADING_KINDS = ['bugVariants', 'correctDesign'] as const;
export const GradingViewSchema = z.object({
  kind: z.enum(GRADING_KINDS),
  state: z.enum(['pending', 'done']),
  total: z.number().int().min(0),
  met: z.number().int().min(0),
});
export type GradingView = z.infer<typeof GradingViewSchema>;

/** What `GET /api/v1/runs/:id` returns to the learner. */
export const RunViewSchema = z.object({
  id: PublicIdSchema,
  drillId: PublicIdSchema,
  state: z.enum(RUN_STATES),
  position: z.number().int().nullable(),
  result: RunResultSchema.nullable(),
  grading: GradingViewSchema.nullable(),
  solved: z.boolean().nullable(),
  createdAt: z.iso.datetime(),
});
export type RunView = z.infer<typeof RunViewSchema>;

/** Whether a run on the visible design reached the Drill's target, so grading is worth doing. */
export function meetsTarget(target: DrillTarget, status: RunStatus): boolean {
  return status === target;
}

/**
 * Whether a run completes the Drill, or null while that is not known yet. The visible design
 * must give the target, and every hidden design its expected answer: a checker that proves
 * anything, or fails on everything, does not solve a Drill.
 */
export function drillSolved(
  target: DrillTarget,
  status: RunStatus | null,
  grading: GradingView | null,
): boolean | null {
  if (status === null) return null;
  if (!meetsTarget(target, status)) return false;
  if (grading === null) return true;
  return grading.state === 'pending' ? null : grading.met === grading.total;
}

/** A run the browser should keep polling: the solver or the grading is still working. */
export const isRunSettling = (view: RunView): boolean =>
  view.state !== 'done' || view.grading?.state === 'pending';

/** Client polling: 1 s, 2 s, then every 5 s (solver-integration.md). */
export const RUN_POLL_DELAYS_MS = [1_000, 2_000, 5_000] as const;
