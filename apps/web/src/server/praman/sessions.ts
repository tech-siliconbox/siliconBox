import 'server-only';
import {
  type ErrorCode,
  type PramanCeilings,
  TOOL_SESSIONS_KEPT,
  ToolEventSchema,
  type ToolPollView,
  type ToolSessionState,
  type ToolSessionSummary,
  ToolSessionSummarySchema,
} from '@siliconbox/shared';
import { z } from 'zod';
import { collectUnusedFiles, readFiles } from '@/db/tool-files';
import { deleteSessionRuns, findToolTrace, latestTraceRun } from '@/db/tool-runs';
import {
  type ToolSessionRecord,
  countToolSessions,
  deleteToolSession,
  findToolSession,
  insertToolSession,
  listToolSessions,
  renameToolSession,
} from '@/db/tool-sessions';
import type { Identity } from '../auth/authenticate';
import { assertPraman } from '../entitlements';
import { AppError } from '../errors';
import {
  closeSolverSession,
  openSolverSession,
  readSolverSession,
  sendSolverRequest,
  takeSolverFinal,
} from '../solver-client';
import { secondsLeft, spendSeconds } from './allowance';
import { EXAMPLE_FILES } from './example';
import { openSessionOf, rememberOpenSession } from './open-session';
import { HostRecordsSchema, keepRecords, savedForReopening } from './records';

/**
 * A learner's Praman sessions (ADR 0031). The web app keeps them; the solver holds an open one
 * in a container of its own. Every call checks access and reads the learner's ceilings first.
 */

const Json = z.record(z.string(), z.unknown());

const PollReplySchema = z.object({
  events: z.array(ToolEventSchema),
  seq: z.number().int(),
  version: z.number().int(),
  busy: z.boolean(),
  proofRunning: z.boolean(),
  state: Json.nullable(),
  records: HostRecordsSchema,
  proofSeconds: z.number().min(0),
});

const FinalSchema = z.object({ records: HostRecordsSchema, proofSeconds: z.number().min(0) });

const HostErrorSchema = z.object({ ok: z.literal(false), status: z.number().int() });

/** What the host's refusals mean to the learner; the host's own words stay in the log. */
const HOST_ERRORS: Readonly<Record<number, ErrorCode>> = {
  400: 'VALIDATION_FAILED',
  404: 'NOT_FOUND',
  409: 'TOOL_SESSION_CLOSED',
  413: 'TOOL_FILES_TOO_LARGE',
};

type Access = { identity: Identity; ceilings: PramanCeilings; now: Date };

async function access(identity: Identity, now: Date): Promise<Access> {
  return { identity, ceilings: await assertPraman(identity, now), now };
}

async function requireSession(userId: string, sessionId: string): Promise<ToolSessionRecord> {
  const session = await findToolSession(userId, sessionId);
  if (session === null) throw new AppError('NOT_FOUND', `no tool session ${sessionId}`);
  return session;
}

async function wireCeilings({ identity, ceilings }: Access) {
  const left = await secondsLeft(identity.userId, ceilings.dailySeconds);
  return {
    proofSeconds: ceilings.proofSeconds,
    traceLength: ceilings.traceLength,
    secondsLeft: Math.floor(left),
  };
}

/** Sends a request to the open session; a refusal by the host becomes an AppError. */
async function ask(
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

export async function listSessions(identity: Identity): Promise<ToolSessionSummary[]> {
  await access(identity, new Date());
  return listToolSessions(identity.userId);
}

export async function createSession(
  identity: Identity,
  name: string,
  now: Date = new Date(),
): Promise<ToolSessionSummary> {
  await access(identity, now);
  if ((await countToolSessions(identity.userId)) >= TOOL_SESSIONS_KEPT) {
    throw new AppError('TOOL_SESSION_LIMIT', `${identity.userId} keeps ${TOOL_SESSIONS_KEPT}`);
  }
  const session = await insertToolSession(identity.userId, name, now);
  return ToolSessionSummarySchema.parse({
    id: session.publicId,
    name: session.name,
    createdAt: session.createdAt.toISOString(),
    lastUsedAt: session.lastUsedAt.toISOString(),
    phase: session.phase,
    top: session.top,
  });
}

export async function renameSession(identity: Identity, sessionId: string, name: string) {
  await access(identity, new Date());
  if (!(await renameToolSession(identity.userId, sessionId, name))) {
    throw new AppError('NOT_FOUND', `no tool session ${sessionId}`);
  }
}

/**
 * Deletes the session with its runs, traces and the file texts nothing else refers to. Personal
 * data (DPDP): allowed even once the learner's access has ended.
 */
export async function deleteSession(identity: Identity, sessionId: string): Promise<void> {
  const { userId } = identity;
  await requireSession(userId, sessionId);
  await closeSolverSession(userId, sessionId);
  await deleteToolSession(userId, sessionId);
  await deleteSessionRuns(userId, sessionId);
  await collectUnusedFiles(userId);
}

/** Keeps a closed session's last records and counts its last engine time, once. */
async function takeFinal(granted: Access, sessionId: string): Promise<void> {
  const { userId } = granted.identity;
  const final = await takeSolverFinal(userId, sessionId);
  if (final === null) return;
  const parsed = FinalSchema.safeParse(final);
  if (!parsed.success) return; // a close that failed on the host has nothing to keep
  await keepRecords(userId, sessionId, parsed.data.records, granted.now);
  await spendSeconds(userId, parsed.data.proofSeconds);
}

type Place = { state: ToolSessionState; position: number | null };

/** Where the session stands on the solver; a closed one hands over its last records. */
async function placeOf(granted: Access, sessionId: string): Promise<Place> {
  const solver = await readSolverSession(granted.identity.userId, sessionId);
  if (solver === null) return { state: 'closed', position: null };
  if (solver.state === 'closed') await takeFinal(granted, sessionId);
  return { state: solver.state, position: solver.position };
}

/** Opens the session on the solver (again, from its last save); it may wait in line first. */
export async function openSession(
  identity: Identity,
  sessionId: string,
  now: Date = new Date(),
): Promise<Place> {
  const granted = await access(identity, now);
  const { userId } = identity;
  await requireSession(userId, sessionId);
  const place = await placeOf(granted, sessionId);
  if (place.state !== 'closed') return place;
  const session = await requireSession(userId, sessionId); // with its last records kept
  const used = session.journal.length + session.files.length > 0;
  const saved = used ? await savedForReopening(userId, session) : null;
  const opening = { name: session.name, saved, ceilings: await wireCeilings(granted) };
  const opened = await openSolverSession(userId, sessionId, opening);
  if (opened === null) {
    // The solver holds another session of this learner: close it, and let the page try again.
    const other = await openSessionOf(userId);
    if (other !== null && other !== sessionId) await closeSolverSession(userId, other);
    throw new AppError('TOOL_SESSION_ELSEWHERE', `${userId} has ${other ?? 'another'} open`);
  }
  await rememberOpenSession(userId, sessionId);
  return { state: opened.state, position: opened.position };
}

/** New log lines and state; keeps what the host handed over and counts the engine time. */
export async function pollSession(
  identity: Identity,
  sessionId: string,
  query: { after: number; version: number },
  now: Date = new Date(),
): Promise<ToolPollView> {
  const granted = await access(identity, now);
  const { userId } = identity;
  await requireSession(userId, sessionId);
  const ceilings = await wireCeilings(granted);
  const reply = await sendSolverRequest(userId, sessionId, { op: 'poll', ...query, ceilings });
  if (reply === null) {
    const place = await placeOf(granted, sessionId);
    return {
      ...place,
      events: [],
      seq: query.after,
      version: query.version,
      busy: false,
      proofRunning: false,
      snapshot: null,
      secondsLeft: ceilings.secondsLeft,
    };
  }
  const poll = PollReplySchema.parse(reply);
  await keepRecords(userId, sessionId, poll.records, now);
  await spendSeconds(userId, poll.proofSeconds);
  return {
    state: 'open',
    position: null,
    events: poll.events,
    seq: poll.seq,
    version: poll.version,
    busy: poll.busy,
    proofRunning: poll.proofRunning,
    snapshot: poll.state,
    secondsLeft: Math.max(0, ceilings.secondsLeft - poll.proofSeconds),
  };
}

/** One console line (a menu action is the line it stands for). */
export async function runCommand(identity: Identity, sessionId: string, line: string) {
  const granted = await access(identity, new Date());
  await requireSession(identity.userId, sessionId);
  await ask(granted, sessionId, { op: 'command', line, ceilings: await wireCeilings(granted) });
}

export async function stopProof(identity: Identity, sessionId: string): Promise<boolean> {
  const granted = await access(identity, new Date());
  await requireSession(identity.userId, sessionId);
  return z.object({ stopped: z.boolean() }).parse(await ask(granted, sessionId, { op: 'stop' }))
    .stopped;
}

export async function putFile(
  identity: Identity,
  sessionId: string,
  file: { name: string; text: string },
): Promise<string> {
  const granted = await access(identity, new Date());
  await requireSession(identity.userId, sessionId);
  const reply = await ask(granted, sessionId, { op: 'putFile', ...file });
  return z.object({ name: z.string() }).parse(reply).name;
}

/** Adds Praman's example design to the session. */
export async function loadExample(identity: Identity, sessionId: string): Promise<void> {
  const granted = await access(identity, new Date());
  await requireSession(identity.userId, sessionId);
  for (const [name, text] of Object.entries(EXAMPLE_FILES)) {
    await ask(granted, sessionId, { op: 'putFile', name, text });
  }
}

/** One file's text as the session last saved it. */
export async function readSessionFile(
  identity: Identity,
  sessionId: string,
  name: string,
): Promise<string> {
  await access(identity, new Date());
  const session = await requireSession(identity.userId, sessionId);
  const ref = session.files.find((file) => file.name === name);
  if (ref === undefined) throw new AppError('NOT_FOUND', `no such file in ${sessionId}`);
  return (await readFiles(identity.userId, [ref]))[name] ?? '';
}

export async function deleteFile(identity: Identity, sessionId: string, name: string) {
  const granted = await access(identity, new Date());
  await requireSession(identity.userId, sessionId);
  await ask(granted, sessionId, { op: 'deleteFile', name });
}

/**
 * A property's trace: from the open session while it holds the run, else the newest kept one.
 */
export async function sessionTrace(
  identity: Identity,
  sessionId: string,
  property: string,
): Promise<Record<string, unknown>> {
  await access(identity, new Date());
  const { userId } = identity;
  await requireSession(userId, sessionId);
  const reply = await sendSolverRequest(userId, sessionId, { op: 'trace', property });
  const live = z.object({ trace: Json }).safeParse(reply);
  if (live.success) return live.data.trace;
  const runId = await latestTraceRun(userId, sessionId, property);
  const kept = runId === null ? null : await findToolTrace(userId, runId, property);
  if (kept === null) throw new AppError('NOT_FOUND', `no trace of a property in ${sessionId}`);
  return kept;
}

/** The commands run in the session, as a Tcl script (from the kept journal). */
export async function sessionScript(identity: Identity, sessionId: string): Promise<string> {
  await access(identity, new Date());
  const session = await requireSession(identity.userId, sessionId);
  return `# Praman session script: the commands run in ${session.name}\n${session.journal.join('\n')}\n`;
}
