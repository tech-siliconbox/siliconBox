import type { Trace } from '@siliconbox/shared';
import { z } from 'zod';

/**
 * A trace as Praman's session hands it over (apps/solver/app/praman/services/counterexample.py,
 * trace_payload): its waveform data, and the explanation of the property on it. The waveform view
 * draws SiliconBox's own Trace, so the data is read into that shape here.
 */
const PramanTraceSchema = z.object({
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
  // A plain-text account of why the property failed (or was covered) on this trace.
  llm_summary: z.string().default(''),
});

export type PramanTrace = { trace: Trace; explanation: string };

/** Praman's trace payload as SiliconBox's Trace; null when it is not one. */
export function readPramanTrace(payload: unknown): PramanTrace | null {
  const parsed = PramanTraceSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { vcd_data: data, llm_summary: explanation } = parsed.data;
  return {
    explanation,
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
