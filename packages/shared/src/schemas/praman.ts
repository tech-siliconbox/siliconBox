import { z } from 'zod';
import type { Level } from './level';

// Praman, the formal tool page (ADR 0031): the learner's ceilings for their level, the caps on
// the work they keep, and the shapes of the /api/v1/tool routes. The solver keeps its own
// absolute ceilings at the Advance values (apps/solver/app/limits.py).

export type PramanCeilings = {
  /** One proof or check. */
  proofSeconds: number;
  /** Cycles a trace may reach. */
  traceLength: number;
  /** Proof time a day: the real time engines run, counted per 24 hours. */
  dailySeconds: number;
};

export const PRAMAN_CEILINGS: Readonly<Record<Level, PramanCeilings>> = {
  basic: { proofSeconds: 5 * 60, traceLength: 50, dailySeconds: 60 * 60 },
  intermediate: { proofSeconds: 15 * 60, traceLength: 100, dailySeconds: 120 * 60 },
  advance: { proofSeconds: 30 * 60, traceLength: 200, dailySeconds: 240 * 60 },
};

/** Sessions a learner keeps; a new one past this asks them to delete one first. */
export const TOOL_SESSIONS_KEPT = 20;
/** The newest runs kept per learner; older ones are dropped. */
export const TOOL_RUNS_KEPT = 50;
export const TOOL_FILES_MAX_BYTES = 1024 * 1024;
/** A longer trace is not kept; its run keeps its results. */
export const TOOL_TRACE_MAX_BYTES = 2 * 1024 * 1024;
/** A session and its runs are deleted this long after the session was last used. */
export const TOOL_RETENTION_DAYS = 180;
/** One console line; longer scripts go in a file and are sourced. */
export const TOOL_LINE_MAX_CHARS = 100_000;
/** A file, property or signal name. */
export const TOOL_NAME_MAX_CHARS = 255;
export const TOOL_SESSION_NAME_MAX_CHARS = 80;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Body of `POST /api/v1/tool/sessions` and `PATCH /api/v1/tool/sessions/:id`. */
export const ToolSessionNameSchema = z.strictObject({
  name: z.string().trim().min(1).max(TOOL_SESSION_NAME_MAX_CHARS),
});

/** Body of `POST /api/v1/tool/sessions/:id/commands`: one line for the Tcl console. */
export const ToolCommandSchema = z.strictObject({
  line: z.string().trim().min(1).max(TOOL_LINE_MAX_CHARS),
});

const NameSchema = z.string().trim().min(1).max(TOOL_NAME_MAX_CHARS);

/** Body of `PUT /api/v1/tool/sessions/:id/files`: add or replace one file. */
export const ToolFileSchema = z.strictObject({
  name: NameSchema,
  text: z.string().refine((text) => byteLength(text) <= TOOL_FILES_MAX_BYTES, {
    message: `A session holds at most ${TOOL_FILES_MAX_BYTES / 1024 / 1024} MB of files`,
  }),
});

/** Query of `DELETE /api/v1/tool/sessions/:id/files`. */
export const ToolFileQuerySchema = z.strictObject({ name: NameSchema });

/** Query of `GET /api/v1/tool/sessions/:id/poll`: the last log line and state the page has. */
export const ToolPollQuerySchema = z.strictObject({
  after: z.coerce.number().int().min(0).default(0),
  version: z.coerce.number().int().min(-1).default(-1),
});

/** Query of the trace routes: a property's id in the session's table. */
export const ToolTraceQuerySchema = z.strictObject({ property: NameSchema });

/** The longest trace any level may ask for: the cycle of a pin or a driver is within it. */
const TRACE_CYCLES_MAX = Math.max(...Object.values(PRAMAN_CEILINGS).map((c) => c.traceLength));
/** Values a what-if may pin on one trace. */
export const TOOL_WHAT_IF_PINS_MAX = 64;

/** A signal held to a value at one cycle of a trace. */
const PinSchema = z.strictObject({
  signal: NameSchema,
  cycle: z.number().int().min(0).max(TRACE_CYCLES_MAX),
  value: z.string().trim().min(1).max(1_100),
  width: z.number().int().min(1).max(4096).default(1),
  radix: z.enum(['hex', 'dec', 'bin', 'signed']).default('hex'),
});

/** A what-if or cover trace of the session (`<session id>_w…` or `_c…`), for its drivers. */
const TraceJobSchema = z.string().regex(/^[0-9a-f-]{36}_[wc][0-9a-f]{8}$/);

/**
 * Body of `POST /api/v1/tool/sessions/:id/what-if`: a trace of the property with these values
 * pinned (and, with `differFrom`, other inputs than that trace), or its quietest trace.
 */
export const ToolWhatIfSchema = z.strictObject({
  property: NameSchema,
  pins: z.array(PinSchema).max(TOOL_WHAT_IF_PINS_MAX).default([]),
  differFrom: z.union([TraceJobSchema, z.literal('')]).default(''),
  quiet: z.boolean().default(false),
});

/** Query of `GET /api/v1/tool/sessions/:id/drivers`: what set a signal at a cycle of a trace. */
export const ToolDriversQuerySchema = z.strictObject({
  property: NameSchema,
  signal: NameSchema,
  cycle: z.coerce.number().int().min(0).max(TRACE_CYCLES_MAX).default(0),
  job: z.union([TraceJobSchema, z.literal('')]).default(''),
});

/** Query of `GET /api/v1/tool/sessions/:id/coverage-trace`: the trace that reaches an item. */
export const ToolCoverageTraceQuerySchema = z.strictObject({
  label: NameSchema,
  instance: z.string().trim().max(TOOL_NAME_MAX_CHARS).default(''),
});

/** Praman names a run after its session and number: `<session id>_r<n>`. */
export const ToolRunIdSchema = z.string().regex(/^[0-9a-f-]{36}_r\d{1,6}$/);
export const ToolRunParamsSchema = z.strictObject({ id: ToolRunIdSchema });

/** Query of `GET /api/v1/tool/runs/:id/diff`: the run to compare with (default: the one before). */
export const ToolRunDiffQuerySchema = z.strictObject({ against: ToolRunIdSchema.optional() });

/** One line of a session's log, as Praman writes it. */
export const ToolEventSchema = z.looseObject({
  seq: z.number().int(),
  t: z.number(),
  kind: z.string(),
  text: z.string(),
});
export type ToolEvent = z.infer<typeof ToolEventSchema>;

export const TOOL_SESSION_STATES = ['closed', 'waiting', 'open'] as const;
export type ToolSessionState = (typeof TOOL_SESSION_STATES)[number];

/** A session in the learner's list. */
export const ToolSessionSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime(),
  phase: z.string(),
  top: z.string(),
});
export type ToolSessionSummary = z.infer<typeof ToolSessionSummarySchema>;

/** What a poll answers: the session's place, new log lines, and Praman's state when it moved. */
export const ToolPollViewSchema = z.object({
  state: z.enum(TOOL_SESSION_STATES),
  /** In the waiting line: 1 for the next session to open. */
  position: z.number().int().nullable(),
  events: z.array(ToolEventSchema),
  seq: z.number().int(),
  version: z.number().int(),
  busy: z.boolean(),
  proofRunning: z.boolean(),
  /** Praman's snapshot of the session (files, hierarchy, properties...), when it changed. */
  snapshot: z.record(z.string(), z.unknown()).nullable(),
  /** Proof time left today. */
  secondsLeft: z.number(),
});
export type ToolPollView = z.infer<typeof ToolPollViewSchema>;

/** A run in the learner's history. */
export const ToolRunSummarySchema = z.object({
  id: ToolRunIdSchema,
  sessionId: z.uuid(),
  number: z.number().int(),
  command: z.string(),
  top: z.string(),
  status: z.string(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  summary: z.record(z.string(), z.unknown()),
});
export type ToolRunSummary = z.infer<typeof ToolRunSummarySchema>;

/** One run with how it was set up, its files (names and sizes) and each property's result. */
export const ToolRunDetailSchema = ToolRunSummarySchema.extend({
  clock: z.string(),
  reset: z.string(),
  settings: z.record(z.string(), z.unknown()),
  script: z.array(z.string()),
  files: z.array(z.object({ name: z.string(), bytes: z.number().int(), analyzed: z.boolean() })),
  properties: z.array(z.record(z.string(), z.unknown())),
  tracesDropped: z.array(z.string()),
});
export type ToolRunDetail = z.infer<typeof ToolRunDetailSchema>;

const PropertyNameSchema = z.object({ name: z.string(), type: z.string() });

/** Properties whose result differs between two runs of a session. */
export const ToolRunDiffSchema = z.object({
  against: ToolRunIdSchema,
  changed: z.array(PropertyNameSchema.extend({ before: z.string(), after: z.string() })),
  added: z.array(PropertyNameSchema.extend({ after: z.string() })),
  removed: z.array(PropertyNameSchema.extend({ before: z.string() })),
});
export type ToolRunDiff = z.infer<typeof ToolRunDiffSchema>;
