import 'server-only';
import {
  TOOL_FILES_MAX_BYTES,
  TOOL_SESSIONS_KEPT,
  type ToolEvent,
  type ToolRunDetail,
  ToolRunDetailSchema,
  type ToolRunDiff,
  type ToolRunLog,
  type ToolRunSummary,
  type ToolSessionSummary,
} from '@siliconbox/shared';
import { z } from 'zod';
import { collectUnusedFiles, keepFiles, putFiles, readFiles } from '@/db/tool-files';
import {
  type ToolRunRecord,
  deleteToolRun,
  findToolRun,
  findToolTrace,
  listToolRuns,
  toRunSummary,
} from '@/db/tool-runs';
import {
  countToolSessions,
  findToolSession,
  insertToolSession,
  keptUntil,
  toSessionSummary,
} from '@/db/tool-sessions';
import type { Identity } from '../auth/authenticate';
import { assertPraman } from '../entitlements';
import { AppError } from '../errors';

/** A learner's Praman run history (ADR 0031): the newest runs, kept with their traces. */

export async function listRuns(identity: Identity): Promise<ToolRunSummary[]> {
  await assertPraman(identity);
  return listToolRuns(identity.userId);
}

async function requireRun(userId: string, runId: string): Promise<ToolRunRecord> {
  const run = await findToolRun(userId, runId);
  if (run === null) throw new AppError('NOT_FOUND', `no tool run ${runId}`);
  return run;
}

export async function readRun(identity: Identity, runId: string): Promise<ToolRunDetail> {
  await assertPraman(identity);
  const run = await requireRun(identity.userId, runId);
  return ToolRunDetailSchema.parse({
    ...toRunSummary(run),
    clock: run.clock,
    reset: run.reset,
    settings: run.settings,
    script: run.script,
    files: run.files.map(({ name, bytes, analyzed }) => ({ name, bytes, analyzed })),
    properties: run.properties,
    tracesDropped: run.tracesDropped,
  });
}

/**
 * Deletes the run and its traces, and the file texts nothing else refers to. Personal data
 * (DPDP): allowed even once the learner's access has ended.
 */
export async function deleteRun(identity: Identity, runId: string): Promise<void> {
  if (!(await deleteToolRun(identity.userId, runId))) {
    throw new AppError('NOT_FOUND', `no tool run ${runId}`);
  }
  await collectUnusedFiles(identity.userId);
}

export async function runTrace(
  identity: Identity,
  runId: string,
  property: string,
): Promise<Record<string, unknown>> {
  await assertPraman(identity);
  const trace = await findToolTrace(identity.userId, runId, property);
  if (trace === null) throw new AppError('NOT_FOUND', `no kept trace in ${runId}`);
  return trace;
}

/**
 * The run's lines of its session's log: those written after the last line before it started, up
 * to its end; none when the session is gone or has trimmed them.
 */
export async function runLog(identity: Identity, runId: string): Promise<ToolRunLog> {
  await assertPraman(identity);
  const run = await requireRun(identity.userId, runId);
  const session = await findToolSession(identity.userId, run.sessionId);
  const events = (session?.events ?? []).filter(
    (event) => event.seq > run.logFrom && event.seq <= run.logTo,
  );
  return { events };
}

/** One file's text as it was when the run started. */
export async function runFile(identity: Identity, runId: string, name: string): Promise<string> {
  await assertPraman(identity);
  const run = await requireRun(identity.userId, runId);
  const ref = run.files.find((file) => file.name === name);
  if (ref === undefined) throw new AppError('NOT_FOUND', `no such file in ${runId}`);
  return (await readFiles(identity.userId, [ref]))[name] ?? '';
}

const PropertyResultSchema = z.object({ name: z.string(), type: z.string(), status: z.string() });

/** Each property's result in a run, by name; records that are not results are left out. */
function resultsOf(properties: readonly Record<string, unknown>[]) {
  const results = new Map<string, { type: string; status: string }>();
  for (const property of properties) {
    const read = PropertyResultSchema.safeParse(property);
    if (read.success) results.set(read.data.name, read.data);
  }
  return results;
}

/** Properties whose result differs between a run and an earlier one (`against`), by name. */
export function diffProperties(
  newer: readonly Record<string, unknown>[],
  older: readonly Record<string, unknown>[],
  against: string,
): ToolRunDiff {
  const now = resultsOf(newer);
  const before = resultsOf(older);
  const diff: ToolRunDiff = { against, changed: [], added: [], removed: [] };
  for (const [name, { type, status }] of now) {
    const old = before.get(name);
    if (old === undefined) diff.added.push({ name, type, after: status });
    else if (old.status !== status)
      diff.changed.push({ name, type, before: old.status, after: status });
  }
  for (const [name, { type, status }] of before) {
    if (!now.has(name)) diff.removed.push({ name, type, before: status });
  }
  return diff;
}

/** What changed since another run (by default the session's run before this one). */
export async function diffRun(
  identity: Identity,
  runId: string,
  against?: string,
): Promise<ToolRunDiff> {
  await assertPraman(identity);
  const { userId } = identity;
  const run = await requireRun(userId, runId);
  // At most 50 runs are kept: the one before is found among them.
  const previous = (await listToolRuns(userId)).find(
    (other) => other.sessionId === run.sessionId && other.number < run.number,
  );
  const otherId = against ?? previous?.id;
  if (otherId === undefined) throw new AppError('NOT_FOUND', `no run before ${runId}`);
  return diffProperties(run.properties, (await requireRun(userId, otherId)).properties, otherId);
}

/** The script a restored session holds: the run's commands, to source again. */
const RESTORED_SCRIPT = 'restored_run.tcl';

function restoredStart(run: ToolRunRecord, now: Date): { script: string; event: ToolEvent } {
  const when = run.startedAt.toISOString().slice(0, 16).replace('T', ' ');
  const script = `# The commands of run ${run.number} (${when} UTC), restored from the run history\n${run.script.join('\n')}\n`;
  const text =
    `Restored from run ${run.number}: its files, and its commands in ${RESTORED_SCRIPT}. ` +
    `source ${RESTORED_SCRIPT} runs them again.`;
  return { script, event: { seq: 1, t: now.getTime() / 1000, kind: 'info', text } };
}

/** A new session holding the run's files and, in restored_run.tcl, its commands. */
export async function restoreRun(
  identity: Identity,
  runId: string,
  now: Date = new Date(),
): Promise<ToolSessionSummary> {
  await assertPraman(identity, now);
  const { userId } = identity;
  const run = await requireRun(userId, runId);
  if ((await countToolSessions(userId)) >= TOOL_SESSIONS_KEPT) {
    throw new AppError('TOOL_SESSION_LIMIT', `${userId} keeps ${TOOL_SESSIONS_KEPT}`);
  }
  const { script, event } = restoredStart(run, now);
  const until = keptUntil(now);
  const kept = run.files
    .filter((file) => file.name !== RESTORED_SCRIPT)
    .map(({ name, sha, bytes }) => ({ name, sha, bytes }));
  const files = [...kept, ...(await putFiles(userId, { [RESTORED_SCRIPT]: script }, until))];
  if (files.reduce((sum, file) => sum + file.bytes, 0) > TOOL_FILES_MAX_BYTES) {
    throw new AppError('TOOL_FILES_TOO_LARGE', `run ${runId} with its script is over the cap`);
  }
  await keepFiles(
    userId,
    kept.map((file) => file.sha),
    until,
  );
  const name = `Restored run ${run.number}`;
  return toSessionSummary(await insertToolSession(userId, name, now, { files, events: [event] }));
}
