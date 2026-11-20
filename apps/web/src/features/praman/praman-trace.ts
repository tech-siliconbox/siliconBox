import type { Trace } from '@siliconbox/shared';
import { z } from 'zod';

/**
 * A trace as Praman's session hands it over (apps/solver/app/praman/services/counterexample.py,
 * trace_payload): its waveform data; the property's own account of it, cycle by cycle (the
 * debug block Visualize draws); and which property, which kind of trace and which run. A part
 * that does not read as expected is left out, never the whole trace.
 */

const ConditionSchema = z.object({
  text: z.string(),
  role: z.string().default('condition'),
  /** Per cycle: 1 when it holds, 0 when not, null when unknown. */
  values: z.array(z.number().nullable()).default([]),
});

const DebugSchema = z.object({
  cycles: z.array(z.number().int()).default([]),
  /** The cycle the property fails in (or the cover is reached in). */
  event_cycle: z.number().int().nullable().default(null),
  trigger_cycle: z.number().int().nullable().default(null),
  antecedent: z
    .object({ text: z.string(), start: z.number().int(), end: z.number().int() })
    .nullable()
    .default(null),
  conditions: z.array(ConditionSchema).default([]),
  locals: z
    .array(z.object({ name: z.string(), values: z.array(z.number().nullable()).default([]) }))
    .default([]),
  signals: z
    .array(
      z.object({
        name: z.string(),
        path: z.string().default(''),
        values: z.array(z.string().nullable()).default([]),
      }),
    )
    .default([]),
  signal_paths: z.array(z.string()).default([]),
  explanation: z.array(z.string()).default([]),
});
export type TraceDebug = z.infer<typeof DebugSchema>;

const KINDS = ['ASSERT', 'COVER', 'LIVE', 'EQUIV'] as const;

const PramanTraceSchema = z.object({
  job_id: z.string().default(''),
  assertion: z
    .object({
      name: z.string().default(''),
      type: z.string().default('ASSERT'),
      trace_kind: z.string().default(''),
      step: z.number().int().nullable().default(null),
    })
    .nullable()
    .catch(null),
  vcd_data: z.object({
    timescale: z.string(),
    end_time: z.number(),
    timepoints: z.array(z.number()),
    signal_details: z.array(
      z.object({
        name: z.string(),
        full_name: z.string(),
        width: z.number().int(),
        transitions: z.array(z.object({ time: z.number(), value: z.string() })),
      }),
    ),
  }),
  debug: DebugSchema.nullable().catch(null),
  // A plain-text account of why the property failed (or was covered) on this trace.
  llm_summary: z.string().default(''),
});

export type TraceKind = (typeof KINDS)[number];

export type PramanTrace = {
  trace: Trace;
  explanation: string;
  debug: TraceDebug | null;
  kind: TraceKind;
  /** The property's name, as Praman labels it. */
  property: string;
  /** The run (or what-if) that holds it: another counterexample asks for different inputs. */
  jobId: string;
  /** The cycle it fails in (or is covered in); null when not known. */
  failCycle: number | null;
};

type Assertion = z.infer<typeof PramanTraceSchema>['assertion'];

function kindOf(assertion: Assertion): TraceKind {
  const named = KINDS.find((kind) => kind === assertion?.trace_kind);
  if (named !== undefined) return named;
  return assertion?.type === 'COVER' ? 'COVER' : 'ASSERT';
}

/** Praman's trace payload as SiliconBox's Trace with its account; null when it is not one. */
export function readPramanTrace(payload: unknown): PramanTrace | null {
  const parsed = PramanTraceSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { vcd_data: data, llm_summary: explanation, debug, assertion } = parsed.data;
  return {
    explanation,
    debug,
    kind: kindOf(assertion),
    property: assertion?.name ?? '',
    jobId: parsed.data.job_id,
    failCycle: debug?.event_cycle ?? assertion?.step ?? null,
    trace: {
      timescale: data.timescale,
      endTime: data.end_time,
      timepoints: data.timepoints,
      signals: data.signal_details.map((signal) => ({
        name: signal.name,
        fullName: signal.full_name,
        width: signal.width,
        transitions: signal.transitions,
      })),
    },
  };
}
