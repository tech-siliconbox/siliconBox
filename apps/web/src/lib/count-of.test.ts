import { describe, expect, it } from 'vitest';
import { countOf } from './count-of';

describe('countOf', () => {
  it('uses the plural for every number but one', () => {
    expect(countOf(1, 'day')).toBe('1 day');
    expect(countOf(0, 'day')).toBe('0 days');
    expect(countOf(3, 'Drill')).toBe('3 Drills');
  });
});
