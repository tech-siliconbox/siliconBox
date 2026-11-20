import 'server-only';
import { DAY_MS } from '@siliconbox/shared';
import { log } from '../log';
import { getRedis } from '../redis';
import { closeSolverSession } from '../solver-client';

/**
 * The learner's open Praman session: the solver holds one per learner (ADR 0031), so opening
 * another closes this one first.
 */

const openKey = (userId: string) => `praman:open-session:${userId}`;

export function openSessionOf(userId: string): Promise<string | null> {
  return getRedis().get(openKey(userId));
}

export async function rememberOpenSession(userId: string, sessionId: string): Promise<void> {
  await getRedis().set(openKey(userId), sessionId, 'PX', DAY_MS);
}

/**
 * Closes the learner's open session on the solver, if any (their account is being deleted). Best
 * effort: the deletion goes ahead when the solver is unreachable; an idle session closes itself
 * and the solver drops its last records within a day.
 */
export async function closeOpenSession(userId: string): Promise<void> {
  try {
    const open = await openSessionOf(userId);
    if (open !== null) await closeSolverSession(userId, open);
    await getRedis().del(openKey(userId));
  } catch (error) {
    log('warn', 'praman_close_failed', { userId, message: String(error) });
  }
}
