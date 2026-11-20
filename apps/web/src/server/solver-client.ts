import 'server-only';
import { RunResultSchema } from '@siliconbox/shared';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { getConfig } from './config';
import { AppError } from './errors';

// The only code that talks to the solver (apps/solver, ADR 0020). Every call carries a token
// signed for one learner and one scope, valid for a minute; the browser never sees the solver.

const ISSUER = 'siliconbox-web';
const AUDIENCE = 'siliconbox-solver';
const TOKEN_LIFETIME_SECONDS = 60;
const CALL_TIMEOUT_MS = 10_000;
// The solver waits up to 20 s for a session's reply before answering "pending".
const SESSION_REQUEST_TIMEOUT_MS = 25_000;

type Scope = 'jobs:write' | 'jobs:read' | 'sessions';

/** What the solver needs for one run; the server fills every setting from the Drill. */
export type SolverJob = {
  design: string;
  properties: string;
  settings: {
    mode: string;
    solver: string;
    depth: number;
    timeoutSeconds: number;
    topModule: string | null;
  };
};

const SolverJobViewSchema = z.object({
  id: z.uuid(),
  state: z.enum(['queued', 'running', 'done']),
  position: z.number().int().nullable(),
  result: RunResultSchema.nullable(),
});
export type SolverJobView = z.infer<typeof SolverJobViewSchema>;

async function sign(scope: Scope, userId: string): Promise<string> {
  const key = new TextEncoder().encode(getConfig().SOLVER_SIGNING_KEY);
  return new SignJWT({ scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
    .sign(key);
}

type Call<T> = {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  scope: Scope;
  userId: string;
  schema: z.ZodType<T>;
  body?: unknown;
  /** Statuses the caller handles itself: the call then answers null. */
  expected?: readonly number[];
  timeoutMs?: number;
};

async function call<T>({
  method,
  path,
  scope,
  userId,
  schema,
  body,
  expected = [],
  timeoutMs = CALL_TIMEOUT_MS,
}: Call<T>): Promise<T | null> {
  const url = new URL(path, getConfig().SOLVER_URL);
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${await sign(scope, userId)}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new AppError('SOLVER_BUSY', `solver unreachable: ${String(error)}`);
  }
  if (expected.includes(response.status)) return null;
  if (response.status === 404) throw new AppError('NOT_FOUND', `solver has no ${path}`);
  if (!response.ok) throw new AppError('SOLVER_BUSY', `solver answered ${response.status}`);
  return schema.parse(await response.json());
}

/** A call whose answer must be there (no status is expected to stand in for it). */
async function answer<T>(spec: Omit<Call<T>, 'expected'>): Promise<T> {
  const value = await call(spec);
  if (value === null) throw new AppError('INTERNAL', `solver gave no answer to ${spec.path}`);
  return value;
}

/** Queues a run for `userId`; returns at once with the solver's job id. */
export function submitJob(userId: string, spec: SolverJob): Promise<SolverJobView> {
  return answer({
    method: 'POST',
    path: '/v1/jobs',
    scope: 'jobs:write',
    userId,
    schema: SolverJobViewSchema,
    body: spec,
  });
}

/** The job's state, and its result once done. Only the learner who started it can read it. */
export function readJob(userId: string, jobId: string): Promise<SolverJobView> {
  const path = `/v1/jobs/${encodeURIComponent(jobId)}`;
  return answer({ method: 'GET', path, scope: 'jobs:read', userId, schema: SolverJobViewSchema });
}

// ── Praman sessions (ADR 0031; apps/solver/CLAUDE.md, "Praman sessions") ──

const SolverSessionSchema = z.object({
  id: z.uuid(),
  state: z.enum(['waiting', 'open', 'closed']),
  position: z.number().int().nullable(),
  reason: z.string(),
});
export type SolverSession = z.infer<typeof SolverSessionSchema>;

const RequestReplySchema = z.object({
  id: z.string(),
  pending: z.boolean(),
  reply: z.record(z.string(), z.unknown()).nullable(),
});

/** What opening asks for: the learner's ceilings and, to reopen, the session's last save. */
export type SessionOpening = {
  name: string;
  saved: Record<string, unknown> | null;
  ceilings: { proofSeconds: number; traceLength: number; secondsLeft: number };
};

/** Opens (or reopens) the session; null when the learner already has another one open. */
export async function openSolverSession(
  userId: string,
  sessionId: string,
  opening: SessionOpening,
): Promise<SolverSession | null> {
  return call({
    method: 'PUT',
    path: `/v1/sessions/${sessionId}`,
    scope: 'sessions',
    userId,
    schema: SolverSessionSchema,
    body: { op: 'open', sessionId, ...opening },
    expected: [409],
  });
}

/** The session's place on the solver; null when the solver has never heard of it. */
export async function readSolverSession(
  userId: string,
  sessionId: string,
): Promise<SolverSession | null> {
  const path = `/v1/sessions/${sessionId}`;
  return call({
    method: 'GET',
    path,
    scope: 'sessions',
    userId,
    schema: SolverSessionSchema,
    expected: [404],
  });
}

export async function closeSolverSession(userId: string, sessionId: string): Promise<void> {
  const path = `/v1/sessions/${sessionId}`;
  await call({
    method: 'DELETE',
    path,
    scope: 'sessions',
    userId,
    schema: SolverSessionSchema,
    expected: [404],
  });
}

const FinalSchema = z.object({ final: z.record(z.string(), z.unknown()).nullable() });

/** A closed session's last records (its host's answer to closing), handed over once. */
export async function takeSolverFinal(
  userId: string,
  sessionId: string,
): Promise<Record<string, unknown> | null> {
  const taken = await answer({
    method: 'DELETE',
    path: `/v1/sessions/${sessionId}/final`,
    scope: 'sessions',
    userId,
    schema: FinalSchema,
  });
  return taken.final;
}

/** The host's reply; null when the session is not open (closed, or still waiting). */
export async function sendSolverRequest(
  userId: string,
  sessionId: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const value = await call({
    method: 'POST',
    path: `/v1/sessions/${sessionId}/requests`,
    scope: 'sessions',
    userId,
    schema: RequestReplySchema,
    body: request,
    expected: [409],
    timeoutMs: SESSION_REQUEST_TIMEOUT_MS,
  });
  if (value === null) return null;
  // A reply slower than the solver's wait is not one the core routes expect: try again shortly.
  if (value.pending || value.reply === null)
    throw new AppError('SOLVER_BUSY', `slow reply to ${String(request.op)}`);
  return value.reply;
}
