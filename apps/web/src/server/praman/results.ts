import 'server-only';
import { z } from 'zod';
import { findToolTrace, latestTraceRun } from '@/db/tool-runs';
import type { Identity } from '../auth/authenticate';
import { AppError } from '../errors';
import { sendSolverRequest } from '../solver-client';
import { grantSession } from './host';

/**
 * What a session's runs show beyond the property table (ADR 0031): the trace of a property, and
 * (PR 5) what-if traces, drivers, coverage and equivalence traces and the HTML report.
 */

const TraceReplySchema = z.object({ trace: z.record(z.string(), z.unknown()) });

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
