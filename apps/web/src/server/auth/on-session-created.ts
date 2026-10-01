import 'server-only';
import type { GenericEndpointContext, Session } from 'better-auth';
import { appendAudit, findLastSignInCountry } from '@/db/audit-log';
import { recordReplacedSessions } from '@/db/ended-sessions';
import { registerMarkCode } from '@/db/watermark-codes';
import { raiseAlert } from '@/server/alerts';
import { clientCountry, signInAnomalies } from '@/server/anomalies';
import { getConfig } from '@/server/config';
import { markCode } from '@/server/invisible-mark';

/**
 * Runs after every new session: audits the sign-in (raising alerts for anomalies), registers the
 * learner's watermark code,
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
  await auditSignIn(session.userId, new Headers(context.request?.headers ?? context.headers ?? {}));
  // Keep the watermark trace table current: this learner's code is what their pages will carry.
  await registerMarkCode(markCode(session.userId, getConfig().BETTER_AUTH_SECRET), session.userId);
  await endOtherSessions(session, context);
}

/** Audits the sign-in with its country and raises alerts for anything unusual about it. */
async function auditSignIn(userId: string, headers: Headers): Promise<void> {
  const country = clientCountry(headers);
  const previousCountry = await findLastSignInCountry(userId);
  await appendAudit({
    action: 'sign_in',
    actorId: userId,
    subjectId: userId,
    metadata: { country },
    createdAt: new Date(),
  });
  const userAgent = headers.get('user-agent');
  for (const kind of signInAnomalies({ userAgent, country, previousCountry })) {
    await raiseAlert(kind, userId, {
      country,
      previousCountry,
      userAgent: userAgent?.slice(0, 200) ?? null,
    });
  }
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
