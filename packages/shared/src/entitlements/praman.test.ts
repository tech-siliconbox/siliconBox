import { describe, expect, it } from 'vitest';
import { PRAMAN_CEILINGS } from '../schemas/praman';
import { contentHeld, toolHeld } from '../testing/entitlements';
import { pramanCeilings } from './praman';

// ADR 0031: the page needs a tool window and a plan; the highest active level sets the ceilings.
const NOW = new Date('2026-11-15T10:00:00.000Z');
const ACTIVE = ['2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'] as const;
const ENDED = ['2026-06-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'] as const;

describe('pramanCeilings', () => {
  it('is null with nothing held', () => {
    expect(pramanCeilings([], NOW)).toBeNull();
  });

  it('is null with a tool window but no plan: no plan, no tool access', () => {
    expect(pramanCeilings([toolHeld(...ACTIVE)], NOW)).toBeNull();
    expect(pramanCeilings([toolHeld(...ACTIVE), contentHeld('basic', ...ENDED)], NOW)).toBeNull();
  });

  it('is null with a plan whose tool window has ended', () => {
    expect(pramanCeilings([contentHeld('advance', ...ACTIVE), toolHeld(...ENDED)], NOW)).toBeNull();
  });

  it('follows the highest active level', () => {
    const held = [toolHeld(...ACTIVE), contentHeld('basic', ...ACTIVE)];
    expect(pramanCeilings(held, NOW)).toEqual(PRAMAN_CEILINGS.basic);
    held.push(contentHeld('intermediate', ...ACTIVE), contentHeld('advance', ...ENDED));
    expect(pramanCeilings(held, NOW)).toEqual(PRAMAN_CEILINGS.intermediate);
  });

  it('matches the access model: 5, 15 and 30 minutes; 50, 100 and 200 cycles; 60, 120 and 240 minutes a day', () => {
    expect(PRAMAN_CEILINGS).toEqual({
      basic: { proofSeconds: 300, traceLength: 50, dailySeconds: 3600 },
      intermediate: { proofSeconds: 900, traceLength: 100, dailySeconds: 7200 },
      advance: { proofSeconds: 1800, traceLength: 200, dailySeconds: 14400 },
    });
  });
});
