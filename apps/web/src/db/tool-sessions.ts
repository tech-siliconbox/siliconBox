import 'server-only';
import {
  TOOL_RETENTION_DAYS,
  type ToolEvent,
  ToolEventSchema,
  type ToolSessionSummary,
  ToolSessionSummarySchema,
} from '@siliconbox/shared';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';
import { FileRefSchema, type FileRef } from './tool-files';

/** Praman keeps this many log lines per session; older ones drop off. */
const EVENTS_KEPT = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A learner's Praman session (ADR 0031): what the solver needs to open it again. */
const ToolSessionRecordSchema = z.object({
  publicId: z.uuid(),
  userId: z.string(),
  name: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date(),
  // A TTL index removes the session this long after its last use.
  expiresAt: z.date(),
  phase: z.string(),
  top: z.string(),
  journal: z.array(z.string()),
  settings: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()),
  files: z.array(FileRefSchema),
  events: z.array(ToolEventSchema),
});
export type ToolSessionRecord = z.infer<typeof ToolSessionRecordSchema>;

/** What a save from the session's host changes. */
export type ToolSessionSave = {
  phase: string;
  top: string;
  journal: string[];
  settings: Record<string, unknown>;
  state: Record<string, unknown>;
  files: FileRef[];
  newEvents: ToolEvent[];
};

const sessions = () => getDb().collection<ToolSessionRecord>(COLLECTIONS.toolSessions);
const NO_ID = { projection: { _id: 0 } };

/** When data last used at `now` is removed. */
export const keptUntil = (now: Date) => new Date(now.getTime() + TOOL_RETENTION_DAYS * DAY_MS);

/** Data whose removal date is more than a day behind `now`'s: extended at most once a day. */
export const fallenBehind = (now: Date) => ({ $lt: new Date(keptUntil(now).getTime() - DAY_MS) });

/** What a new session starts with: nothing, or (a restored run) its files and a log line. */
type SessionStart = Pick<ToolSessionRecord, 'files' | 'events'>;

export async function insertToolSession(
  userId: string,
  name: string,
  now: Date,
  start: SessionStart = { files: [], events: [] },
): Promise<ToolSessionRecord> {
  const record = ToolSessionRecordSchema.parse({
    publicId: crypto.randomUUID(),
    userId,
    name,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: keptUntil(now),
    phase: 'empty',
    top: '',
    journal: [],
    settings: {},
    state: {},
    ...start,
  });
  await sessions().insertOne({ ...record });
  return record;
}

export function countToolSessions(userId: string): Promise<number> {
  return sessions().countDocuments({ userId });
}

const SummaryFieldsSchema = ToolSessionRecordSchema.pick({
  publicId: true,
  name: true,
  createdAt: true,
  lastUsedAt: true,
  phase: true,
  top: true,
});

/** A session as the learner's list shows it. */
export function toSessionSummary(fields: z.infer<typeof SummaryFieldsSchema>): ToolSessionSummary {
  return ToolSessionSummarySchema.parse({
    id: fields.publicId,
    name: fields.name,
    createdAt: fields.createdAt.toISOString(),
    lastUsedAt: fields.lastUsedAt.toISOString(),
    phase: fields.phase,
    top: fields.top,
  });
}

/** The learner's sessions, most recently used first, without their contents. */
export async function listToolSessions(userId: string): Promise<ToolSessionSummary[]> {
  const projection = {
    _id: 0,
    publicId: 1,
    name: 1,
    createdAt: 1,
    lastUsedAt: 1,
    phase: 1,
    top: 1,
  };
  const found = await sessions()
    .find({ userId }, { projection })
    .sort({ lastUsedAt: -1 })
    .toArray();
  return found.map((document) => toSessionSummary(SummaryFieldsSchema.parse(document)));
}

/** Every session of the learner, without its log (the data download). */
export async function findAllToolSessions(userId: string): Promise<ToolSessionRecord[]> {
  const found = await sessions().find({ userId }, NO_ID).sort({ createdAt: 1 }).toArray();
  return found.map((document) => ToolSessionRecordSchema.parse({ ...document, events: [] }));
}

export async function findToolSession(
  userId: string,
  publicId: string,
): Promise<ToolSessionRecord | null> {
  const found = await sessions().findOne({ userId, publicId }, NO_ID);
  return found === null ? null : ToolSessionRecordSchema.parse(found);
}

export async function renameToolSession(
  userId: string,
  publicId: string,
  name: string,
): Promise<boolean> {
  const done = await sessions().updateOne({ userId, publicId }, { $set: { name } });
  return done.matchedCount === 1;
}

/** Keeps a save from the session's host; the log grows by its new lines, the oldest drop off. */
export async function saveToolSession(
  userId: string,
  publicId: string,
  save: ToolSessionSave,
  now: Date,
): Promise<void> {
  const { newEvents, ...fields } = save;
  await sessions().updateOne(
    { userId, publicId },
    {
      $set: { ...fields, lastUsedAt: now, expiresAt: keptUntil(now) },
      $push: { events: { $each: newEvents, $slice: -EVENTS_KEPT } },
    },
  );
}

export async function deleteToolSession(userId: string, publicId: string): Promise<boolean> {
  const done = await sessions().deleteOne({ userId, publicId });
  return done.deletedCount === 1;
}
