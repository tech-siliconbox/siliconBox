import 'server-only';
import { type AuditEntry, AuditEntrySchema } from '@siliconbox/shared';
import type { ClientSession } from 'mongodb';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/**
 * Append-only: this repository exposes no update or delete, and the app DB user has none.
 * Pass `session` to write inside a caller's transaction.
 */
export async function appendAudit(entry: AuditEntry, session?: ClientSession): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.auditLog)
    .insertOne(AuditEntrySchema.parse(entry), session === undefined ? {} : { session });
}

const SignInCountrySchema = z.object({ metadata: z.object({ country: z.string() }) });

/** The country recorded with the learner's most recent sign-in, if any. */
export async function findLastSignInCountry(userId: string): Promise<string | null> {
  const entry = await getDb()
    .collection(COLLECTIONS.auditLog)
    .findOne(
      { action: 'sign_in', subjectId: userId, 'metadata.country': { $type: 'string' } },
      { sort: { createdAt: -1 }, projection: { _id: 0, 'metadata.country': 1 } },
    );
  const parsed = SignInCountrySchema.safeParse(entry);
  return parsed.success ? parsed.data.metadata.country : null;
}

const SignInSchema = z.object({
  createdAt: z.date(),
  metadata: z.object({ country: z.string().nullable().optional() }).optional(),
});

/** Every recorded sign-in of the learner, newest first: when, and from which country. */
export async function findSignIns(userId: string): Promise<{ at: Date; country: string | null }[]> {
  const entries = await getDb()
    .collection(COLLECTIONS.auditLog)
    .find(
      { action: 'sign_in', subjectId: userId },
      { sort: { createdAt: -1 }, projection: { _id: 0, createdAt: 1, 'metadata.country': 1 } },
    )
    .toArray();
  return entries.map((entry) => {
    const { createdAt, metadata } = SignInSchema.parse(entry);
    return { at: createdAt, country: metadata?.country ?? null };
  });
}
