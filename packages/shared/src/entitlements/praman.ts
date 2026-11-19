import type { Entitlement } from '../schemas/entitlement';
import { PRAMAN_CEILINGS, type PramanCeilings } from '../schemas/praman';
import { decideAccess } from './access';
import { highestActiveLevel } from './held';

/**
 * The ceilings Praman puts on this learner (ADR 0031): those of their highest active level, the
 * rule that sets the Drill run quota. Null without access: no plan, no tool access.
 */
export function pramanCeilings(
  entitlements: readonly Entitlement[],
  now: Date,
): PramanCeilings | null {
  const level = highestActiveLevel(entitlements, now);
  const access = decideAccess({ kind: 'praman' }, { entitlements }, now);
  return access.allowed && level !== null ? PRAMAN_CEILINGS[level] : null;
}
