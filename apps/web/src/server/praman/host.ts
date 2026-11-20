import 'server-only';
import type { ErrorCode, PramanCeilings } from '@siliconbox/shared';
import { z } from 'zod';
import { type ToolSessionRecord, findToolSession } from '@/db/tool-sessions';
import type { Identity } from '../auth/authenticate';
import { assertPraman } from '../entitlements';
import { AppError } from '../errors';
import { sendSolverRequest } from '../solver-client';
import { secondsLeft } from './allowance';

/**
 * What every call about a Praman session starts with (ADR 0031): the learner's access and
 * ceilings, their own session, and requests to the session's host on the solver.
 */

export type Access = { identity: Identity; ceilings: PramanCeilings; now: Date };

export async function access(identity: Identity, now: Date): Promise<Access> {
  return { identity, ceilings: await assertPraman(identity, now), now };
}

export async function requireSession(
  userId: string,
  sessionId: string,
): Promise<ToolSessionRecord> {
  const session = await findToolSession(userId, sessionId);
  if (session === null) throw new AppError('NOT_FOUND', `no tool session ${sessionId}`);
  return session;
}

/** Access checked and the learner's own session found. */
export async function grantSession(
  identity: Identity,
  sessionId: string,
  now: Date = new Date(),
): Promise<Access> {
  const granted = await access(identity, now);
  await requireSession(identity.userId, sessionId);
  return granted;
}

/** The ceilings sent with a request that may start an engine, with the proof time left today. */
export async function wireCeilings({ identity, ceilings }: Access) {
  const left = await secondsLeft(identity.userId, ceilings.dailySeconds);
  return {
    proofSeconds: ceilings.proofSeconds,
    traceLength: ceilings.traceLength,
    secondsLeft: Math.floor(left),
  };
}

const HostErrorSchema = z.object({ ok: z.literal(false), status: z.number().int() });

/** What the host's refusals mean to the learner; the host's own words stay in the log. */
const HOST_ERRORS: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  404: 'NOT_FOUND',
  409: 'TOOL_SESSION_CLOSED',
  413: 'TOOL_FILES_TOO_LARGE',
  423: 'TOOL_PROOF_RUNNING',
};

/** Sends a request to the open session; a refusal by the host becomes an AppError. */
export async function ask(
  { identity }: Access,
  sessionId: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const reply = await sendSolverRequest(identity.userId, sessionId, request);
  if (reply === null) throw new AppError('TOOL_SESSION_CLOSED', `session ${sessionId} not open`);
  const refused = HostErrorSchema.safeParse(reply);
  if (refused.success) {
    const code = HOST_ERRORS[refused.data.status] ?? 'INTERNAL';
    // The host's own words may quote file names: only the operation and status are logged.
    throw new AppError(code, `host refused ${String(request.op)} (${refused.data.status})`);
  }
  return reply;
}
