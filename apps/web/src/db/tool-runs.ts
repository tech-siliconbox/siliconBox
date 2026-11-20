import 'server-only';
import { ToolRunIdSchema, type ToolRunSummary, ToolRunSummarySchema } from '@siliconbox/shared';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';
import { FileRefSchema, keepFiles } from './tool-files';
import { fallenBehind, keptUntil } from './tool-sessions';

/** One proof of a Praman session (ADR 0031): what was proven, how, and how it ended. */
const ToolRunRecordSchema = z.object({
  publicId: ToolRunIdSchema,
  sessionId: z.uuid(),
  userId: z.string(),
  number: z.number().int(),
  command: z.string(),
  top: z.string(),
  clock: z.string(),
  reset: z.string(),
  status: z.enum(['running', 'complete', 'stopped', 'failed']),
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
  settings: z.record(z.string(), z.unknown()),
  script: z.array(z.string()),
  files: z.array(FileRefSchema.extend({ analyzed: z.boolean() })),
  logFrom: z.number().int(),
  logTo: z.number().int(),
  summary: z.record(z.string(), z.unknown()),
  properties: z.array(z.record(z.string(), z.unknown())),
  tracesDropped: z.array(z.string()),
  tools: z.record(z.string(), z.unknown()),
  // A TTL index removes the run with its session's data.
  expiresAt: z.date(),
});
export type ToolRunRecord = z.infer<typeof ToolRunRecordSchema>;
/** How a run ended, and the traces it kept by property id. */
export type ToolRunFinish = Pick<
  ToolRunRecord,
  'status' | 'finishedAt' | 'summary' | 'logTo' | 'properties' | 'tracesDropped'
> & { traces: Readonly<Record<string, Record<string, unknown>>> };

const TraceRecordSchema = z.object({
  runId: ToolRunIdSchema,
  propId: z.string(),
  sessionId: z.uuid(),
  userId: z.string(),
  trace: z.record(z.string(), z.unknown()),
  expiresAt: z.date(),
});

const runs = () => getDb().collection(COLLECTIONS.toolRuns);
const traces = () => getDb().collection(COLLECTIONS.toolTraces);
const NO_ID = { projection: { _id: 0 } };

/** Records a run that started; a repeated record of the same run changes nothing. */
export async function insertToolRun(run: ToolRunRecord): Promise<void> {
  const record = ToolRunRecordSchema.parse(run);
  await runs().updateOne(
    { userId: record.userId, publicId: record.publicId },
    { $setOnInsert: record },
    { upsert: true },
  );
}

/** Records how a run ended, and keeps the traces it produced. */
export async function finishToolRun(
  userId: string,
  runId: string,
  finish: ToolRunFinish,
  now: Date,
): Promise<void> {
  const fields = ToolRunRecordSchema.pick({
    status: true,
    finishedAt: true,
    summary: true,
    logTo: true,
    properties: true,
    tracesDropped: true,
  }).parse(finish);
  const run = await runs().findOneAndUpdate(
    { userId, publicId: runId },
    { $set: fields },
    { projection: { sessionId: 1 } },
  );
  if (run === null) return;
  const sessionId = String(run.sessionId);
  const entries = Object.entries(finish.traces).map(([propId, trace]) =>
    TraceRecordSchema.parse({
      runId,
      propId,
      sessionId,
      userId,
      trace,
      expiresAt: keptUntil(now),
    }),
  );
  if (entries.length === 0) return;
  await traces().bulkWrite(
    entries.map((entry) => ({
      replaceOne: { filter: { runId, propId: entry.propId }, replacement: entry, upsert: true },
    })),
    { ordered: false },
  );
}

const SummaryFieldsSchema = ToolRunRecordSchema.pick({
  publicId: true,
  sessionId: true,
  number: true,
  command: true,
  top: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  summary: true,
});

/** A run (record or projection) as the learner's history shows it. */
export function toRunSummary(document: unknown): ToolRunSummary {
  const run = SummaryFieldsSchema.parse(document);
  return ToolRunSummarySchema.parse({
    id: run.publicId,
    sessionId: run.sessionId,
    number: run.number,
    command: run.command,
    top: run.top,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    summary: run.summary,
  });
}

/** The learner's runs, newest first, without their files, properties or traces. */
export async function listToolRuns(userId: string): Promise<ToolRunSummary[]> {
  const projection = {
    _id: 0,
    publicId: 1,
    sessionId: 1,
    number: 1,
    command: 1,
    top: 1,
    status: 1,
    startedAt: 1,
    finishedAt: 1,
    summary: 1,
  };
  const found = await runs().find({ userId }, { projection }).sort({ startedAt: -1 }).toArray();
  return found.map(toRunSummary);
}

/** Every run of the learner, oldest first (the data download). */
export async function findAllToolRuns(userId: string): Promise<ToolRunRecord[]> {
  const found = await runs().find({ userId }, NO_ID).sort({ startedAt: 1 }).toArray();
  return found.map((document) => ToolRunRecordSchema.parse(document));
}

export async function findToolRun(userId: string, runId: string): Promise<ToolRunRecord | null> {
  const found = await runs().findOne({ userId, publicId: runId }, NO_ID);
  return found === null ? null : ToolRunRecordSchema.parse(found);
}

export async function findToolTrace(
  userId: string,
  runId: string,
  propId: string,
): Promise<Record<string, unknown> | null> {
  const found = await traces().findOne({ userId, runId, propId }, NO_ID);
  return found === null ? null : TraceRecordSchema.parse(found).trace;
}

/** The newest run of the session that kept a trace of `propId`. */
export async function latestTraceRun(
  userId: string,
  sessionId: string,
  propId: string,
): Promise<string | null> {
  const found = await traces()
    .find({ userId, sessionId, propId }, { projection: { _id: 0, runId: 1 } })
    .toArray();
  // Runs are numbered within their session: `<session>_r<n>`.
  const number = (runId: string) => Number(runId.slice(runId.lastIndexOf('_r') + 2));
  const newest = found.map((trace) => String(trace.runId)).sort((a, b) => number(b) - number(a));
  return newest[0] ?? null;
}

export async function deleteToolRun(userId: string, runId: string): Promise<boolean> {
  const done = await runs().deleteOne({ userId, publicId: runId });
  await traces().deleteMany({ userId, runId });
  return done.deletedCount === 1;
}

export async function deleteSessionRuns(userId: string, sessionId: string): Promise<void> {
  await Promise.all([
    runs().deleteMany({ userId, sessionId }),
    traces().deleteMany({ userId, sessionId }),
  ]);
}

/** Drops the learner's runs past the newest `keep`, with their traces. */
export async function trimToolRuns(userId: string, keep: number): Promise<number> {
  const old = await runs()
    .find({ userId }, { projection: { publicId: 1 } })
    .sort({ startedAt: -1 })
    .skip(keep)
    .toArray();
  if (old.length === 0) return 0;
  const ids = old.map((run) => String(run.publicId));
  await Promise.all([
    runs().deleteMany({ userId, publicId: { $in: ids } }),
    traces().deleteMany({ userId, runId: { $in: ids } }),
  ]);
  return ids.length;
}

/** A session in use keeps its runs, their traces and their files (at most one update a day). */
export async function keepSessionRuns(userId: string, sessionId: string, now: Date): Promise<void> {
  const behind = { userId, sessionId, expiresAt: fallenBehind(now) };
  const shas = (await runs().distinct('files.sha', behind)).map(String);
  const until = { $set: { expiresAt: keptUntil(now) } };
  await Promise.all([
    runs().updateMany(behind, until),
    traces().updateMany(behind, until),
    keepFiles(userId, shas, keptUntil(now)),
  ]);
}
