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

type Scope = 'jobs:write' | 'jobs:read';

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

async function call(path: string, scope: Scope, userId: string, body?: SolverJob) {
  const url = new URL(path, getConfig().SOLVER_URL);
  const init: RequestInit = {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${await sign(scope, userId)}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    cache: 'no-store',
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new AppError('SOLVER_BUSY', `solver unreachable: ${String(error)}`);
  }
  if (response.status === 404) throw new AppError('NOT_FOUND', `solver has no ${path}`);
  if (!response.ok) throw new AppError('SOLVER_BUSY', `solver answered ${response.status}`);
  return SolverJobViewSchema.parse(await response.json());
}

/** Queues a run for `userId`; returns at once with the solver's job id. */
export function submitJob(userId: string, job: SolverJob): Promise<SolverJobView> {
  return call('/v1/jobs', 'jobs:write', userId, job);
}

/** The job's state, and its result once done. Only the learner who started it can read it. */
export function readJob(userId: string, jobId: string): Promise<SolverJobView> {
  return call(`/v1/jobs/${encodeURIComponent(jobId)}`, 'jobs:read', userId);
}
