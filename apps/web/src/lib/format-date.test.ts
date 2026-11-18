import { describe, expect, it } from 'vitest';
import { formatDate, formatMonth, formatTimeAgo } from './format-date';

const NOW = new Date('2026-11-19T10:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('dates', () => {
  it('formats a date on India time', () => {
    expect(formatDate(new Date('2027-02-17T20:00:00Z'))).toBe('18 Feb 2027');
    expect(formatMonth(new Date('2027-02-28T19:00:00Z'))).toBe('Mar');
  });

  it('says how long ago, then the date after a week', () => {
    expect(formatTimeAgo(ago(30 * 1000), NOW)).toBe('just now');
    expect(formatTimeAgo(ago(5 * 60 * 1000), NOW)).toBe('5 minutes ago');
    expect(formatTimeAgo(ago(3 * 60 * 60 * 1000), NOW)).toBe('3 hours ago');
    expect(formatTimeAgo(ago(26 * 60 * 60 * 1000), NOW)).toBe('yesterday');
    expect(formatTimeAgo(ago(9 * 24 * 60 * 60 * 1000), NOW)).toBe('10 Nov 2026');
  });
});
