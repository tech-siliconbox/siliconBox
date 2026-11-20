import { z } from 'zod';

/**
 * The deeper checks' results as Praman's session keeps them (apps/solver/app/praman/commands.py:
 * check_strength, check_cov, check_equivalence). The page reads what its panels show; the rest
 * passes by.
 */

const Count = z.number().default(0);

/** A part of the design measured: covered of total, and the percentage. */
const PartSchema = z.object({ covered: Count, total: Count, percent: Count });
export type CoveragePart = z.infer<typeof PartSchema>;

const MutantSchema = z.object({
  index: z.number(),
  status: z.string(),
  location: z.string().default(''),
  mutation: z.string().default(''),
  code: z.string().default(''),
  detected_by: z.array(z.string()).default([]),
  message: z.string().default(''),
});
export type Mutant = z.infer<typeof MutantSchema>;

/** check_strength: small changes (mutants) to the design, and which proven assertions notice. */
export const StrengthSchema = z.object({
  status: z.string(),
  score: z.number().nullable().default(null),
  done: Count,
  total: Count,
  detected: Count,
  checked: Count,
  equivalent: Count,
  timed_out: Count,
  message: z.string().default(''),
  per_assertion: z.record(z.string(), z.number()).default({}),
  mutants: z.array(MutantSchema).default([]),
});
export type Strength = z.infer<typeof StrengthSchema>;

const CoverageItemSchema = z.object({
  label: z.string(),
  instance: z.string().default(''),
  status: z.string(),
  file: z.string().default(''),
  line: z.number().int().default(0),
  what: z.string().default(''),
  statements: Count,
  cycles: z.number().nullable().default(null),
  /** The coverage run holding its trace, for the drivers of a signal on it. */
  job_id: z.string().default(''),
});
export type CoverageItem = z.infer<typeof CoverageItemSchema>;

const CoreLineSchema = z.object({
  file: z.string(),
  line: z.number().int(),
  status: z.string(),
  properties: z.array(z.string()).default([]),
  outside_cone: z.boolean().default(false),
  detail: z.string().default(''),
});

/** One instance's scores, when the design has several. */
const InstanceCoverageSchema = z.object({
  instance: z.string(),
  module: z.string().default(''),
  branches: PartSchema,
  statements: PartSchema,
  toggles: PartSchema,
});
export type InstanceCoverage = z.infer<typeof InstanceCoverageSchema>;

/** check_cov (branches, statements, toggles) or check_cov -type proof (the proof core). */
export const CoverageSchema = z.object({
  status: z.string(),
  kind: z.string().default('branch'),
  covered: Count,
  unreachable: Count,
  undetermined: Count,
  reset: Count,
  percent: Count,
  total: Count,
  items: z.array(CoverageItemSchema).default([]),
  toggles: z.array(CoverageItemSchema).default([]),
  statements: PartSchema.nullable().default(null),
  toggle_summary: PartSchema.extend({ unreachable: Count }).nullable().default(null),
  /** Signal bits not measured for toggles (no clock in their module). */
  toggle_bits_left_out: Count,
  instances: z.array(InstanceCoverageSchema).catch([]),
  lines: z.array(CoreLineSchema).default([]),
  proven: z.array(z.string()).default([]),
  relied_on: Count,
  not_relied_on: Count,
});
export type Coverage = z.infer<typeof CoverageSchema>;

/** check_equivalence: does a revised design behave like the analyzed one? */
export const EquivalenceSchema = z.object({
  status: z.string(),
  revised: z.array(z.string()).default([]),
  mode: z.string().default(''),
  has_trace: z.boolean().default(false),
  detail: z.string().default(''),
  explanation: z.array(z.string()).default([]),
  differences: z
    .array(z.object({ output: z.string(), original: z.string(), revised: z.string() }))
    .default([]),
});
export type Equivalence = z.infer<typeof EquivalenceSchema>;

const DriverSchema = z.object({
  file: z.string().default(''),
  line: z.number().int().default(0),
  kind: z.string().default(''),
  clocked: z.boolean().default(false),
  text: z.string().default(''),
  /** The values the statement read, at the cycle it computed the signal's value. */
  values: z.record(z.string(), z.string()).default({}),
  values_at: z.number().int().nullable().default(null),
});

/** What set a signal's value at a cycle of a trace, or why it cannot be traced. */
export const DriversSchema = z.object({
  signal: z.string().default(''),
  value: z.string().default(''),
  cycle: z.number().int().default(0),
  drivers: z.array(DriverSchema).default([]),
  error: z.string().default(''),
});
export type Drivers = z.infer<typeof DriversSchema>;

/** A what-if's (or quiet trace's) answer: a new trace, or the message why there is none. */
export const WhatIfResultSchema = z.object({
  job_id: z.string().default(''),
  verdict: z.string(),
  message: z.string().default(''),
  trace: z.unknown().nullable().default(null),
});
export type WhatIfResult = z.infer<typeof WhatIfResultSchema>;
