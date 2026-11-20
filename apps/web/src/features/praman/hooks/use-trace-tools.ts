'use client';

import { useState } from 'react';
import type { Drivers } from '../praman-reports';
import { type PramanTrace, readPramanTrace } from '../praman-trace';
import { type Pin, askDrivers, askWhatIf } from '../trace-tools';

/** What the waveform's tools ask about: a trace of the open session. */
export type TraceAnalysis = {
  sessionId: string;
  /** The property (or coverage item) whose trace it is. */
  property: string;
  /** The run holding the trace when it is not the property's own (a cover trace). */
  job: string;
  /** What-if and quiet traces prove the property again: only for properties. */
  whatIf: boolean;
};

/** A trace a what-if found, shown instead of the original, with how it was asked for. */
type Found = { trace: PramanTrace; note: string; job: string };

/** The waveform's what-if, quiet trace and drivers, and what they answered. */
export function useTraceTools(analysis: TraceAnalysis | undefined) {
  const [found, setFound] = useState<Found | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Drivers | null>(null);

  const whatIf = async (
    ask: { pins?: Pin[]; quiet?: boolean; differFrom?: string },
    note: string,
  ) => {
    if (analysis === undefined) return;
    setStatus('Proving the what-if…');
    const answer = await askWhatIf(analysis.sessionId, { property: analysis.property, ...ask });
    if (!answer.ok) {
      setStatus(answer.message);
      return;
    }
    const trace = answer.value.trace === null ? null : readPramanTrace(answer.value.trace);
    setStatus(trace === null ? answer.value.message || 'No trace was found.' : null);
    if (trace !== null) setFound({ trace, note, job: answer.value.job_id });
  };

  const showDrivers = async (signal: string, cycle: number) => {
    if (analysis === undefined) return;
    const job = found?.job ?? analysis.job;
    const answer = await askDrivers(analysis.sessionId, {
      property: analysis.property,
      signal,
      cycle,
      job,
    });
    setDrivers(answer.ok ? answer.value : null);
    setStatus(answer.ok ? null : answer.message);
  };

  return { found, status, drivers, whatIf, showDrivers, original: () => setFound(null) };
}
export type TraceTools = ReturnType<typeof useTraceTools>;
