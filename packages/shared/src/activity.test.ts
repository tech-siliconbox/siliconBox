import { describe, expect, it } from 'vitest';
import { activityDay, activityWeeks, currentStreak, longestStreak } from './activity';

describe('activity days', () => {
  it('counts a late evening in India as that day', () => {
    // 23:00 in India on 18 November is 17:30 UTC the same day; 01:00 on the 19th is still the 18th in UTC.
    expect(activityDay(new Date('2026-11-18T17:30:00Z'))).toBe('2026-11-18');
    expect(activityDay(new Date('2026-11-18T19:30:00Z'))).toBe('2026-11-19');
  });

  it('keeps a streak alive until the day is over, and breaks it on a missed day', () => {
    const now = new Date('2026-11-18T06:00:00Z');
    expect(currentStreak(new Set(['2026-11-16', '2026-11-17', '2026-11-18']), now)).toBe(3);
    expect(currentStreak(new Set(['2026-11-16', '2026-11-17']), now)).toBe(2);
    expect(currentStreak(new Set(['2026-11-15', '2026-11-16']), now)).toBe(0);
    expect(currentStreak(new Set(), now)).toBe(0);
  });

  it('finds the longest run of days, across month ends', () => {
    const days = new Set(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-05', '2026-11-06']);
    expect(longestStreak(days)).toBe(3);
    expect(longestStreak(new Set())).toBe(0);
  });

  it('lays a year out in whole weeks from Monday, ending today', () => {
    // 18 November 2026 is a Wednesday.
    const weeks = activityWeeks(new Map([['2026-11-17', 3]]), new Date('2026-11-18T06:00:00Z'));
    expect(weeks).toHaveLength(53);
    expect(weeks[0]?.[0]?.day).toBe('2025-11-17');
    expect(weeks[0]).toHaveLength(7);
    expect(weeks.at(-1)).toEqual([
      { day: '2026-11-16', count: 0 },
      { day: '2026-11-17', count: 3 },
      { day: '2026-11-18', count: 0 },
    ]);
  });
});
