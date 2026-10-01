import type { Entitlement } from '../schemas/entitlement';
import { type Level, levelRank } from '../schemas/level';
import { isActive } from './window';

/** The highest level with an active content window, or null when none is active. */
export function highestActiveLevel(entitlements: readonly Entitlement[], now: Date): Level | null {
  let highest: Level | null = null;
  for (const entitlement of entitlements) {
    if (entitlement.kind !== 'content' || !isActive(entitlement, now)) continue;
    if (highest === null || levelRank(entitlement.level) > levelRank(highest)) {
      highest = entitlement.level;
    }
  }
  return highest;
}
