import 'server-only';
import type { GenericEndpointContext, Session } from 'better-auth';
import { appendAudit } from '@/db/audit-log';
import { recordReplacedSessions } from '@/db/ended-sessions';
import { registerMarkCode } from '@/db/watermark-codes';
import { getConfig } from '@/server/config';
import { markCode } from '@/server/invisible-mark';

/**
 * Runs after every new session: audits the sign-in, registers the learner's watermark code,
 * then enforces one active device per
 * learner (ADR 0005) by ending every other session of that user. Running after creation
 * means a failed sign-in never logs anyone out.
 */
export async function onSessionCreated(
  session: Session,
  context: GenericEndpointContext | null,
): Promise<void> {
  if (context === null) {
    throw new Error('Session created without an endpoint context; cannot enforce one device');
  }
  await appendAudit({
    action: 'sign_in',
    actorId: session.userId,
    subjectId: session.userId,
    createdAt: new Date(),
  });
  // Keep the watermark trace table current: this learner's code is what their pages will carry.
  await registerMarkCode(markCode(session.userId, getConfig().BETTER_AUTH_SECRET), session.userId);
  await endOtherSessions(session, context);
}

async function endOtherSessions(session: Session, context: GenericEndpointContext): Promise<void> {
  const adapter = context.context.internalAdapter;
  const otherTokens = (await adapter.listSessions(session.userId))
    .map((other) => other.token)
    .filter((token) => token !== session.token);
  if (otherTokens.length === 0) return;

  await recordReplacedSessions(session.userId, otherTokens);
  await adapter.deleteSessions(otherTokens);
  await appendAudit({
    action: 'session_replaced',
    actorId: session.userId,
    subjectId: session.userId,
    metadata: { endedSessions: otherTokens.length },
    createdAt: new Date(),
  });
}
