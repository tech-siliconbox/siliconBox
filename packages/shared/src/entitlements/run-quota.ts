import type { Entitlement } from '../schemas/entitlement';
import { DRILL_RUN_DAILY_QUOTA } from '../schemas/run';
import { highestActiveLevel } from './held';

/** Runs a learner may start today: by their highest active level, 0 without access. */
export function dailyRunQuota(entitlements: readonly Entitlement[], now: Date): number {
  const level = highestActiveLevel(entitlements, now);
  return level === null ? 0 : DRILL_RUN_DAILY_QUOTA[level];
}
