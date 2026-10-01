import 'server-only';
import type { Identity } from './auth/authenticate';

/**
 * The visible mark tiled over a signed-in learner's pages: a short id, an email fragment
 * and the date, enough to trace a leak without printing the full address.
 */
export function visibleMark(identity: Pick<Identity, 'userId' | 'email'>, now: Date): string {
  const [local = '', domain = ''] = identity.email.split('@');
  const emailFragment = `${local.slice(0, 3)}…@${domain}`;
  return `${identity.userId.slice(-6)} · ${emailFragment} · ${now.toISOString().slice(0, 10)}`;
}
