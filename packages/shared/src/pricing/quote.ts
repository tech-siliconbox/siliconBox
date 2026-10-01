import { LEVEL_PRICE_PAISE } from '../constants';
import { type GrantPlan, grantFor } from '../entitlements/grant';
import { highestActiveLevel } from '../entitlements/held';
import type { ErrorCode } from '../errors';
import type { Entitlement } from '../schemas/entitlement';
import { type Level, levelRank } from '../schemas/level';

export type PurchaseQuote =
  | { allowed: true; tier: Level; held: Level | null; amountPaise: number; grant: GrantPlan }
  | { allowed: false; reason: Extract<ErrorCode, 'PURCHASE_NOT_ALLOWED'> };

/** Upgrades cost the difference only while the lower level is still active. */
export function priceFor(tier: Level, held: Level | null): number {
  if (held !== null && levelRank(held) < levelRank(tier)) {
    return LEVEL_PRICE_PAISE[tier] - LEVEL_PRICE_PAISE[held];
  }
  return LEVEL_PRICE_PAISE[tier];
}

/** Server-side price and grant for buying `tier` now. Never trust either from the client. */
export function quotePurchase(
  tier: Level,
  entitlements: readonly Entitlement[],
  now: Date,
): PurchaseQuote {
  const held = highestActiveLevel(entitlements, now);
  if (held !== null && levelRank(tier) < levelRank(held)) {
    return { allowed: false, reason: 'PURCHASE_NOT_ALLOWED' };
  }
  return {
    allowed: true,
    tier,
    held,
    amountPaise: priceFor(tier, held),
    grant: grantFor(tier, held, now),
  };
}
