import 'server-only';
import { TOOL_RUNS_KEPT, ToolEventSchema, ToolRunIdSchema } from '@siliconbox/shared';
import { z } from 'zod';
import { collectUnusedFiles, putFiles, readFiles } from '@/db/tool-files';
import { finishToolRun, insertToolRun, keepSessionRuns, trimToolRuns } from '@/db/tool-runs';
import { type ToolSessionRecord, keptUntil, saveToolSession } from '@/db/tool-sessions';

/**
 * What a session host hands the web app (apps/solver/app/praman/store.py, the outbox) and how it
 * is kept (ADR 0031). Every record is checked before it is written.
 */

const Json = z.record(z.string(), z.unknown());

const SavedSessionSchema = z.object({
  id: z.uuid(),
  createdAt: z.number(),
  phase: z.string(),
  top: z.string(),
  journal: z.array(z.string()),
  settings: Json,
  files: z.record(z.string(), z.string()),
  newEvents: z.array(ToolEventSchema),
  state: Json,
});

const RunStartedSchema = z.object({
  type: z.literal('runStarted'),
  id: ToolRunIdSchema,
  sessionId: z.uuid(),
  number: z.number().int(),
  command: z.string(),
  top: z.string(),
  clock: z.string(),
  reset: z.string(),
  startedAt: z.number(),
  settings: Json,
  script: z.array(z.string()),
  files: z.array(z.object({ name: z.string(), text: z.string(), analyzed: z.boolean() })),
  logFrom: z.number().int(),
  tools: Json,
});

const RunFinishedSchema = z.object({
  type: z.literal('runFinished'),
  id: ToolRunIdSchema,
  status: z.enum(['complete', 'stopped', 'failed']),
  finishedAt: z.number(),
  summary: Json,
  logTo: z.number().int(),
  properties: z.array(Json),
  traces: z.record(z.string(), Json),
  tracesDropped: z.array(z.string()),
});

export const HostRecordsSchema = z.object({
  session: SavedSessionSchema.nullable(),
  runs: z.array(z.discriminatedUnion('type', [RunStartedSchema, RunFinishedSchema])),
});
export type HostRecords = z.infer<typeof HostRecordsSchema>;

const fromEpoch = (seconds: number) => new Date(seconds * 1000);

async function keepRunStarted(
  userId: string,
  run: z.infer<typeof RunStartedSchema>,
  now: Date,
): Promise<void> {
  const texts = Object.fromEntries(run.files.map((file) => [file.name, file.text]));
  const refs = await putFiles(userId, texts, keptUntil(now));
  const analyzed = new Set(run.files.filter((file) => file.analyzed).map((file) => file.name));
  await insertToolRun({
    publicId: run.id,
    sessionId: run.sessionId,
    userId,
    number: run.number,
    command: run.command,
    top: run.top,
    clock: run.clock,
    reset: run.reset,
    status: 'running',
    startedAt: fromEpoch(run.startedAt),
    finishedAt: null,
    settings: run.settings,
    script: run.script,
    files: refs.map((ref) => ({ ...ref, analyzed: analyzed.has(ref.name) })),
    logFrom: run.logFrom,
    logTo: run.logFrom,
    summary: {},
    properties: [],
    tracesDropped: [],
    tools: run.tools,
    expiresAt: keptUntil(now),
  });
}

/** Keeps what the session's host handed over: its save, the runs it started and finished. */
export async function keepRecords(
  userId: string,
  sessionId: string,
  records: HostRecords,
  now: Date,
): Promise<void> {
  const saved = records.session;
  if (saved !== null && saved.id === sessionId) {
    const files = await putFiles(userId, saved.files, keptUntil(now));
    const { phase, top, journal, settings, state, newEvents } = saved;
    await saveToolSession(
      userId,
      sessionId,
      { phase, top, journal, settings, state, files, newEvents },
      now,
    );
    await keepSessionRuns(userId, sessionId, now);
  }
  // Each run belongs to this session: its id starts with the session's.
  const own = records.runs.filter((run) => run.id.startsWith(`${sessionId}_r`));
  for (const run of own) {
    if (run.type === 'runStarted') {
      await keepRunStarted(userId, run, now);
    } else {
      const { status, summary, logTo, properties, tracesDropped, traces } = run;
      const finishedAt = fromEpoch(run.finishedAt);
      const finish = { status, finishedAt, summary, logTo, properties, tracesDropped, traces };
      await finishToolRun(userId, run.id, finish, now);
    }
  }
  if (own.some((run) => run.type === 'runStarted')) {
    const dropped = await trimToolRuns(userId, TOOL_RUNS_KEPT);
    if (dropped > 0) await collectUnusedFiles(userId);
  }
}

// The solver's limits on a save it opens a session from (apps/solver/app/praman/protocol.py).
const SAVED_JOURNAL_LINES = 10_000;
const SAVED_EVENTS = 20_000;

/** The save a closed session is opened again from, as the session's host reads it. */
export async function savedForReopening(
  userId: string,
  session: ToolSessionRecord,
): Promise<Record<string, unknown>> {
  return {
    createdAt: session.createdAt.getTime() / 1000,
    journal: session.journal.slice(-SAVED_JOURNAL_LINES),
    settings: session.settings,
    files: await readFiles(userId, session.files),
    events: session.events.slice(-SAVED_EVENTS),
    state: session.state,
  };
}
