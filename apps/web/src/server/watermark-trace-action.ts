'use server';

import { type AdminRole, WatermarkTraceInputSchema } from '@siliconbox/shared';
import { appendAudit } from '@/db/audit-log';
import { cmsAdminSession, hasAdminRole } from './cms-admin';
import { RATE_LIMITS, enforceRateLimit, redisRateLimiter } from './rate-limit';
import { type TraceMatch, traceLeak } from './watermark-trace';

/** The same people who may grant access may trace a leak to an account. */
const TRACE_ROLES: readonly AdminRole[] = ['support', 'owner'];

export type TraceState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'done'; matches: TraceMatch[] };

const fail = (message: string): TraceState => ({ status: 'error', message });

/**
 * Traces pasted leak text to learner accounts. Support and Owner only, rate-limited, and every
 * lookup goes to the audit log. The text itself is never stored or logged.
 */
export async function traceLeakAction(_previous: TraceState, form: FormData): Promise<TraceState> {
  const session = await cmsAdminSession();
  if (session === null || !hasAdminRole(session.admin.role, TRACE_ROLES)) {
    return fail('Only Support and the Owner can trace a leak.');
  }
  const input = WatermarkTraceInputSchema.safeParse({ text: form.get('text') });
  if (!input.success) return fail('Paste between 1 and 100,000 characters of leaked text.');
  try {
    await enforceRateLimit(
      redisRateLimiter,
      `admin:${session.admin.id}`,
      RATE_LIMITS.watermarkTrace,
    );
  } catch {
    return fail('Too many traces in the last hour. Try again later.');
  }

  const matches = await traceLeak(input.data.text);
  const learnerIds = [...new Set(matches.flatMap((match) => match.learners.map((l) => l.id)))];
  await appendAudit({
    action: 'watermark_trace',
    actorId: session.admin.id,
    subjectId: learnerIds.length === 1 ? (learnerIds[0] ?? null) : null,
    metadata: { clues: matches.length, learners: learnerIds.join(',').slice(0, 500) || null },
    createdAt: new Date(),
  });
  return { status: 'done', matches };
}
