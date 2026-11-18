import type { Entitlement, Window } from '../schemas/entitlement';
import type { Level } from '../schemas/level';
import { isActive } from './window';

/** Where a learner stands with one access window. */
export type WindowStatus =
  { state: 'active'; endsAt: Date } | { state: 'ended'; endedAt: Date } | { state: 'none' };

function statusOf(window: Window | undefined, now: Date): WindowStatus {
  if (window === undefined || now < window.startsAt) return { state: 'none' };
  return isActive(window, now)
    ? { state: 'active', endsAt: window.endsAt }
    : { state: 'ended', endedAt: window.endsAt };
}

/** The learner's lessons-and-Drills window for one level (one per level, by the unique index). */
export const contentStatus = (entitlements: readonly Entitlement[], level: Level, now: Date) =>
  statusOf(
    entitlements.find((held) => held.kind === 'content' && held.level === level),
    now,
  );

/** The learner's formal-tool window. */
export const toolStatus = (entitlements: readonly Entitlement[], now: Date) =>
  statusOf(
    entitlements.find((held) => held.kind === 'tool'),
    now,
  );
