import type { Entitlement } from '../schemas/entitlement';
import type { Level } from '../schemas/level';

// Invented learner and dates for tests only.
const LEARNER_ID = 'learner-test-1';

export function contentHeld(level: Level, startsAt: string, endsAt: string): Entitlement {
  return {
    userId: LEARNER_ID,
    kind: 'content',
    level,
    source: 'order',
    orderId: `order-${level}`,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  };
}

export function toolHeld(startsAt: string, endsAt: string): Entitlement {
  return {
    userId: LEARNER_ID,
    kind: 'tool',
    source: 'order',
    orderId: 'order-tool',
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  };
}
