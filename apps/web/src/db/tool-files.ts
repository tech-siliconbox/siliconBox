import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/**
 * File texts of Praman sessions and runs (ADR 0031), stored once per learner by content hash, as
 * Praman stores them: a session's files and every run's snapshot only refer to them, so fifty
 * runs of the same design keep one copy. A text no session or run refers to is collected.
 */

export const FileRefSchema = z.object({
  name: z.string(),
  sha: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().min(0),
});
export type FileRef = z.infer<typeof FileRefSchema>;

const files = () => getDb().collection(COLLECTIONS.toolFiles);
const sessions = () => getDb().collection(COLLECTIONS.toolSessions);
const runs = () => getDb().collection(COLLECTIONS.toolRuns);

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** Stores the texts (once each) and returns their references; texts live at least to `keepUntil`. */
export async function putFiles(
  userId: string,
  texts: Readonly<Record<string, string>>,
  keepUntil: Date,
): Promise<FileRef[]> {
  const refs = Object.entries(texts).map(([name, text]) => ({
    ref: { name, sha: sha256(text), bytes: Buffer.byteLength(text, 'utf8') },
    text,
  }));
  if (refs.length > 0) {
    await files().bulkWrite(
      refs.map(({ ref, text }) => ({
        updateOne: {
          filter: { userId, sha: ref.sha },
          update: { $setOnInsert: { text, bytes: ref.bytes }, $max: { expiresAt: keepUntil } },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }
  return refs.map(({ ref }) => ref);
}

/** The texts behind `refs`, by file name. */
export async function readFiles(
  userId: string,
  refs: readonly FileRef[],
): Promise<Record<string, string>> {
  const found = await files()
    .find({ userId, sha: { $in: refs.map((ref) => ref.sha) } }, { projection: { sha: 1, text: 1 } })
    .toArray();
  const bySha = new Map(found.map((document) => [String(document.sha), String(document.text)]));
  return Object.fromEntries(refs.map((ref) => [ref.name, bySha.get(ref.sha) ?? '']));
}

/** Keeps the texts behind `shas` at least to `keepUntil` (their session is still in use). */
export async function keepFiles(
  userId: string,
  shas: readonly string[],
  keepUntil: Date,
): Promise<void> {
  if (shas.length === 0) return;
  await files().updateMany({ userId, sha: { $in: [...shas] } }, { $max: { expiresAt: keepUntil } });
}

/** Deletes the learner's texts that no session or run refers to any more. */
export async function collectUnusedFiles(userId: string): Promise<void> {
  const [fromSessions, fromRuns] = await Promise.all([
    sessions().distinct('files.sha', { userId }),
    runs().distinct('files.sha', { userId }),
  ]);
  const used = [fromSessions, fromRuns].flatMap((shas: unknown[]) => shas.map(String));
  await files().deleteMany({ userId, sha: { $nin: used } });
}
