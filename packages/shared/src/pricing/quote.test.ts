import { describe, expect, it } from 'vitest';
import type { Entitlement } from '../schemas/entitlement';
import type { Level } from '../schemas/level';
import { contentHeld } from '../testing/entitlements';
import { quotePurchase } from './quote';

// Rows 1-10 of docs/testing/entitlement-test-matrix.md. Purchase date d = 2026-11-15.
const D = '2026-11-15T10:00:00.000Z';
const D_PLUS = {
  3: '2027-02-15T10:00:00.000Z',
  6: '2027-05-15T10:00:00.000Z',
  9: '2027-08-15T10:00:00.000Z',
} as const;

const basicActive = contentHeld('basic', '2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
const basicEnded = contentHeld('basic', '2026-06-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
const intermediateActive = contentHeld(
  'intermediate',
  '2026-10-01T00:00:00.000Z',
  '2027-01-01T00:00:00.000Z',
);
const intermediateEnded = contentHeld(
  'intermediate',
  '2026-03-01T00:00:00.000Z',
  '2026-09-01T00:00:00.000Z',
);

type Row = {
  row: number;
  buy: Level;
  hold: Entitlement[];
  rupees: number;
  content: Level[];
  months: keyof typeof D_PLUS;
};

const rows: Row[] = [
  { row: 1, buy: 'basic', hold: [], rupees: 5000, content: ['basic'], months: 3 },
  {
    row: 2,
    buy: 'intermediate',
    hold: [],
    rupees: 10000,
    content: ['basic', 'intermediate'],
    months: 6,
  },
  {
    row: 3,
    buy: 'advance',
    hold: [],
    rupees: 15000,
    content: ['basic', 'intermediate', 'advance'],
    months: 9,
  },
  {
    row: 4,
    buy: 'intermediate',
    hold: [basicActive],
    rupees: 5000,
    content: ['intermediate'],
    months: 3,
  },
  {
    row: 5,
    buy: 'advance',
    hold: [basicActive],
    rupees: 10000,
    content: ['basic', 'intermediate', 'advance'],
    months: 9,
  },
  {
    row: 6,
    buy: 'advance',
    hold: [intermediateActive],
    rupees: 5000,
    content: ['basic', 'intermediate', 'advance'],
    months: 9,
  },
  {
    row: 7,
    buy: 'intermediate',
    hold: [basicEnded],
    rupees: 10000,
    content: ['basic', 'intermediate'],
    months: 6,
  },
  {
    row: 8,
    buy: 'advance',
    hold: [basicEnded],
    rupees: 15000,
    content: ['basic', 'intermediate', 'advance'],
    months: 9,
  },
  {
    row: 9,
    buy: 'advance',
    hold: [intermediateEnded],
    rupees: 15000,
    content: ['basic', 'intermediate', 'advance'],
    months: 9,
  },
  { row: 10, buy: 'basic', hold: [basicActive], rupees: 5000, content: ['basic'], months: 3 },
];

function expectAllowed(buy: Level, hold: Entitlement[], now: string) {
  const quote = quotePurchase(buy, hold, new Date(now));
  if (!quote.allowed) throw new Error(`expected ${buy} to be purchasable`);
  return quote;
}

describe('purchase and upgrade matrix', () => {
  it.each(rows)('row $row: buy $buy for ₹$rupees', ({ buy, hold, rupees, content, months }) => {
    const quote = expectAllowed(buy, hold, D);

    expect(quote.amountPaise).toBe(rupees * 100);
    expect(quote.grant.content).toEqual(
      content.map((level) => ({
        level,
        startsAt: new Date(D),
        endsAt: new Date(D_PLUS[months]),
      })),
    );
    expect(quote.grant.tool).toEqual({ startsAt: new Date(D), endsAt: new Date(D_PLUS[3]) });
  });
});

describe('boundaries and refusals', () => {
  it('prices an upgrade as the difference in the last millisecond of the lower window', () => {
    const quote = expectAllowed('intermediate', [basicActive], '2026-12-31T23:59:59.999Z');
    expect(quote.amountPaise).toBe(500_000);
  });

  it('charges full price from the instant the lower window ends', () => {
    const quote = expectAllowed('intermediate', [basicActive], '2027-01-01T00:00:00.000Z');
    expect(quote.amountPaise).toBe(1_000_000);
    expect(quote.held).toBeNull();
  });

  it('refuses buying a lower level while a higher one is active', () => {
    expect(quotePurchase('basic', [intermediateActive], new Date(D))).toEqual({
      allowed: false,
      reason: 'PURCHASE_NOT_ALLOWED',
    });
  });

  it('uses the highest active level when several are held', () => {
    const quote = expectAllowed('advance', [basicActive, intermediateActive], D);
    expect(quote.held).toBe('intermediate');
    expect(quote.amountPaise).toBe(500_000);
  });
});
