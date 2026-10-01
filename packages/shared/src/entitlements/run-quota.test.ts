import { describe, expect, it } from 'vitest';
import { DRILL_RUN_DAILY_QUOTA } from '../schemas/run';
import { contentHeld, toolHeld } from '../testing/entitlements';
import { dailyRunQuota } from './run-quota';

const NOW = new Date('2026-11-15T10:00:00.000Z');
const ACTIVE = ['2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'] as const;
const ENDED = ['2026-06-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'] as const;

describe('dailyRunQuota', () => {
  it('is zero without an active content window, even with a tool window', () => {
    expect(dailyRunQuota([toolHeld(...ACTIVE)], NOW)).toBe(0);
    expect(dailyRunQuota([contentHeld('advance', ...ENDED)], NOW)).toBe(0);
  });

  it('follows the highest active level', () => {
    const held = [contentHeld('basic', ...ACTIVE), contentHeld('intermediate', ...ACTIVE)];
    expect(dailyRunQuota(held, NOW)).toBe(DRILL_RUN_DAILY_QUOTA.intermediate);
  });

  it('ignores a higher level whose window has ended', () => {
    const held = [contentHeld('basic', ...ACTIVE), contentHeld('advance', ...ENDED)];
    expect(dailyRunQuota(held, NOW)).toBe(DRILL_RUN_DAILY_QUOTA.basic);
  });

  it('gives Advance more runs than Basic', () => {
    expect(DRILL_RUN_DAILY_QUOTA.advance).toBeGreaterThan(DRILL_RUN_DAILY_QUOTA.basic);
  });
});
