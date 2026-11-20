import { API_ROUTES, PRAMAN_CEILINGS } from '@siliconbox/shared';
import type { z } from 'zod';
import { errorMessage } from '@/lib/api-error';
import {
  type Drivers,
  DriversSchema,
  type WhatIfResult,
  WhatIfResultSchema,
} from './praman-reports';

// The waveform's questions to the open session (ADR 0031): a what-if or quiet trace, which may
// prove for minutes, and the drivers of a signal.

const ASK_AGAIN_MS = 2_000;
/** A what-if proves within the learner's proof time: the longest any level has, and a minute. */
const WHAT_IF_DEADLINE_MS =
  (Math.max(...Object.values(PRAMAN_CEILINGS).map((ceiling) => ceiling.proofSeconds)) + 60) * 1_000;

/** What Visualize's tools ask about: a trace of the open session. */
export type TraceAnalysis = {
  sessionId: string;
  /** The property (or coverage item) whose trace it is. */
  property: string;
  /** The run holding the trace when it is not the property's own (a cover trace). */
  job: string;
  /** What-if and quiet traces prove the property again: only for properties. */
  whatIf: boolean;
};

/** A trace to open in Visualize: where to read it, its title, and what its tools may ask. */
export type OpenTrace = { url: string; title: string; analysis?: TraceAnalysis };

/** A property's trace in the open session: what-if and drivers can be asked of it. */
export const propertyTrace = (
  sessionId: string,
  property: { id: string; name: string },
): OpenTrace => ({
  url: `${API_ROUTES.toolSessionTrace(sessionId)}?${new URLSearchParams({ property: property.id })}`,
  title: property.name,
  analysis: { sessionId, property: property.id, job: '', whatIf: true },
});

export type Answer<T> = { ok: true; value: T } | { ok: false; message: string };

/** A value pinned for a what-if: the signal holds it at that cycle of the trace. */
export type Pin = {
  signal: string;
  cycle: number;
  value: string;
  /** How the value is written (hex unless said), and the signal's width in bits. */
  width?: number;
  radix?: 'hex' | 'dec' | 'signed' | 'bin';
};

async function answerOf<T>(response: Response | null, schema: z.ZodType<T>): Promise<Answer<T>> {
  if (response?.ok !== true) return { ok: false, message: await errorMessage(response) };
  const read = schema.safeParse(await response.json().catch(() => null));
  return read.success
    ? { ok: true, value: read.data }
    : { ok: false, message: await errorMessage(null) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks for a what-if (or the quietest trace) and waits while the session proves it. */
export async function askWhatIf(
  sessionId: string,
  body: { property: string; pins?: Pin[]; quiet?: boolean; differFrom?: string },
): Promise<Answer<WhatIfResult>> {
  const started = Date.now();
  let response = await fetch(API_ROUTES.toolSessionWhatIf(sessionId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  while (response?.status === 202 && Date.now() - started < WHAT_IF_DEADLINE_MS) {
    const { requestId } = (await response.json()) as { requestId: string };
    await sleep(ASK_AGAIN_MS);
    const url = API_ROUTES.toolSessionWhatIfResult(sessionId, requestId);
    response = await fetch(url).catch(() => null);
  }
  return answerOf(response, WhatIfResultSchema);
}

/** What set `signal` at `cycle` of a trace: a property's, or (`job`) a what-if or cover trace. */
export async function askDrivers(
  sessionId: string,
  query: { property: string; signal: string; cycle: number; job: string },
): Promise<Answer<Drivers>> {
  const params = new URLSearchParams({ ...query, cycle: String(query.cycle) });
  const response = await fetch(`${API_ROUTES.toolSessionDrivers(sessionId)}?${params}`).catch(
    () => null,
  );
  return answerOf(response, DriversSchema);
}
