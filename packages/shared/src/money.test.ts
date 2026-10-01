import { describe, expect, it } from 'vitest';
import { formatInr } from './money';

describe('formatInr', () => {
  it.each([
    [500_000, '₹5,000'],
    [1_500_000, '₹15,000'],
    [10_000_000, '₹1,00,000'],
    [123_450, '₹1,234.5'],
  ])('%i paise shows as %s', (paise, expected) => {
    expect(formatInr(paise)).toBe(expected);
  });
});
