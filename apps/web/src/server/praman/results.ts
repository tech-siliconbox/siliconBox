import 'server-only';
import type {
  ToolCoverageTraceQuerySchema,
  ToolDriversQuerySchema,
  ToolWhatIfSchema,
} from '@siliconbox/shared';
import { z } from 'zod';
import { findToolTrace, latestTraceRun } from '@/db/tool-runs';
import type { Identity } from '../auth/authenticate';
import { AppError } from '../errors';
import { type SolverReply, sendSolverRequest } from '../solver-client';
import { ask, askLater, askLong, grantSession, wireCeilings } from './host';

/**
 * What a session's runs show beyond the property table (ADR 0031): the trace of a property,
 * what-if and quiet traces, what drove a signal, the traces of coverage items and of an
 * equivalence difference, and the HTML report of the last proof. Each is asked of the open
 * session; only a property's trace is also read from the kept runs.
 */

const Json = z.record(z.string(), z.unknown());
const TraceReplySchema = z.object({ trace: Json });

/**
 * A property's trace: from the open session while it holds the run, else the newest kept one.
 */
export async function sessionTrace(
  identity: Identity,
  sessionId: string,
  property: string,
): Promise<Record<string, unknown>> {
  await grantSession(identity, sessionId);
  const { userId } = identity;
  const reply = await sendSolverRequest(userId, sessionId, { op: 'trace', property });
  const live = TraceReplySchema.safeParse(reply);
  if (live.success) return live.data.trace;
  const runId = await latestTraceRun(userId, sessionId, property);
  const kept = runId === null ? null : await findToolTrace(userId, runId, property);
  if (kept === null) throw new AppError('NOT_FOUND', `no trace of a property in ${sessionId}`);
  return kept;
}

/** A what-if's result (its trace, or why there is none), or the id to ask for it again. */
export type WhatIfAnswer =
  { done: true; result: Record<string, unknown> } | { done: false; requestId: string };

const answerOf = (reply: SolverReply): WhatIfAnswer =>
  'pending' in reply
    ? { done: false, requestId: reply.pending }
    : { done: true, result: reply.reply };

/** Proves the property again with values pinned (or for its quietest trace), within the ceilings. */
export async function startWhatIf(
  identity: Identity,
  sessionId: string,
  body: z.infer<typeof ToolWhatIfSchema>,
): Promise<WhatIfAnswer> {
  const granted = await grantSession(identity, sessionId);
  const request = { op: 'whatIf', ...body, ceilings: await wireCeilings(granted) };
  return answerOf(await askLong(granted, sessionId, request));
}

/** A what-if started before: its result once the proof has finished. */
export async function readWhatIf(
  identity: Identity,
  sessionId: string,
  requestId: string,
): Promise<WhatIfAnswer> {
  const granted = await grantSession(identity, sessionId);
  return answerOf(await askLater(granted, sessionId, requestId, 'whatIf'));
}

/** What set a signal's value at a cycle of a trace, as Praman's drivers view shows it. */
export async function traceDrivers(
  identity: Identity,
  sessionId: string,
  query: z.infer<typeof ToolDriversQuerySchema>,
): Promise<Record<string, unknown>> {
  const granted = await grantSession(identity, sessionId);
  const reply = await ask(granted, sessionId, { op: 'drivers', ...query });
  return z.object({ drivers: Json }).parse(reply).drivers;
}

/** The trace that reaches a coverage item of the last check_cov. */
export async function coverageTrace(
  identity: Identity,
  sessionId: string,
  query: z.infer<typeof ToolCoverageTraceQuerySchema>,
): Promise<Record<string, unknown>> {
  const granted = await grantSession(identity, sessionId);
  const reply = await ask(granted, sessionId, { op: 'coverageTrace', ...query });
  return TraceReplySchema.parse(reply).trace;
}

/** The trace on which the revised design of the last check_equivalence differs. */
export async function equivalenceTrace(
  identity: Identity,
  sessionId: string,
): Promise<Record<string, unknown>> {
  const granted = await grantSession(identity, sessionId);
  return TraceReplySchema.parse(await ask(granted, sessionId, { op: 'equivalenceTrace' })).trace;
}

/** The last finished proof as one HTML file, with the name Praman gives it. */
export async function sessionReport(
  identity: Identity,
  sessionId: string,
): Promise<{ name: string; html: string }> {
  const granted = await grantSession(identity, sessionId);
  const reply = await ask(granted, sessionId, { op: 'report' });
  return z.object({ name: z.string(), html: z.string() }).parse(reply);
}

/** A what-if's answer over HTTP: 200 with its result, or 202 with the id to ask again by. */
export function whatIfResponse(answer: WhatIfAnswer): Response {
  return answer.done
    ? Response.json(answer.result)
    : Response.json({ requestId: answer.requestId }, { status: 202 });
}
