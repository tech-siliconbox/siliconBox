import { CONTENT_MONTHS, INTERMEDIATE_UPGRADE_MONTHS, TOOL_WINDOW_MONTHS } from '../constants';
import type { Window } from '../schemas/entitlement';
import { type Level, levelsUpTo } from '../schemas/level';
import { windowFrom } from './window';

export type ContentGrant = { level: Level } & Window;
export type GrantPlan = { content: ContentGrant[]; tool: Window };

/**
 * What a purchase of `tier` grants, given the highest level still active at purchase time.
 * Callers must reject downgrades first (see `quotePurchase`).
 */
export function grantFor(tier: Level, held: Level | null, purchasedAt: Date): GrantPlan {
  return {
    content: contentFor(tier, held, purchasedAt),
    tool: windowFrom(purchasedAt, TOOL_WINDOW_MONTHS),
  };
}

function contentFor(tier: Level, held: Level | null, purchasedAt: Date): ContentGrant[] {
  // The one upgrade that leaves the lower level's own window untouched.
  if (tier === 'intermediate' && held === 'basic') {
    return [{ level: 'intermediate', ...windowFrom(purchasedAt, INTERMEDIATE_UPGRADE_MONTHS) }];
  }
  const window = windowFrom(purchasedAt, CONTENT_MONTHS[tier]);
  return levelsUpTo(tier).map((level) => ({ level, ...window }));
}
