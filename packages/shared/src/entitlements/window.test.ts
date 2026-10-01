import { describe, expect, it } from 'vitest';
import { addMonths, isActive } from './window';

describe('addMonths', () => {
  it.each([
    ['2026-11-15T10:00:00.000Z', 3, '2027-02-15T10:00:00.000Z'],
    ['2026-11-15T10:00:00.000Z', 9, '2027-08-15T10:00:00.000Z'],
    ['2026-11-30T10:00:00.000Z', 3, '2027-02-28T10:00:00.000Z'],
    ['2027-11-30T10:00:00.000Z', 3, '2028-02-29T10:00:00.000Z'],
    ['2026-01-31T00:00:00.000Z', 1, '2026-02-28T00:00:00.000Z'],
  ])('%s + %i months = %s', (from, months, expected) => {
    expect(addMonths(new Date(from), months).toISOString()).toBe(expected);
  });

  it('does not mutate its input', () => {
    const from = new Date('2026-11-15T10:00:00.000Z');
    addMonths(from, 3);
    expect(from.toISOString()).toBe('2026-11-15T10:00:00.000Z');
  });
});

describe('isActive', () => {
  const window = {
    startsAt: new Date('2026-11-15T10:00:00.000Z'),
    endsAt: new Date('2027-02-15T10:00:00.000Z'),
  };

  it.each([
    ['one millisecond before the start', '2026-11-15T09:59:59.999Z', false],
    ['at the start', '2026-11-15T10:00:00.000Z', true],
    ['the last second before the end', '2027-02-15T09:59:59.999Z', true],
    ['at the end', '2027-02-15T10:00:00.000Z', false],
  ])('%s: %s', (_label, now, expected) => {
    expect(isActive(window, new Date(now))).toBe(expected);
  });
});
