import { z } from 'zod';
import type { DRILL_TARGETS } from './drill';
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

/** What `GET /api/v1/runs/:id` returns to the learner. */
export const RunViewSchema = z.object({
  id: PublicIdSchema,
  drillId: PublicIdSchema,
  state: z.enum(RUN_STATES),
  position: z.number().int().nullable(),
  result: RunResultSchema.nullable(),
  solved: z.boolean().nullable(),
  createdAt: z.iso.datetime(),
});
export type RunView = z.infer<typeof RunViewSchema>;

/**
 * Whether a finished run completes the Drill. PASS Drills: the learner's properties all hold on
 * a correct design. FAIL Drills: the learner's properties catch the seeded bug.
 */
export function isDrillSolved(target: (typeof DRILL_TARGETS)[number], status: RunStatus): boolean {
  return status === target;
}

/** Client polling: 1 s, 2 s, then every 5 s (solver-integration.md). */
export const RUN_POLL_DELAYS_MS = [1_000, 2_000, 5_000] as const;
