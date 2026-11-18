import { describe, expect, it } from 'vitest';
import type { Entitlement } from '../schemas/entitlement';
import { contentStatus, toolStatus } from './status';

const NOW = new Date('2026-11-18T10:00:00Z');
const window = (from: string, to: string) => ({
  userId: 'learner',
  startsAt: new Date(from),
  endsAt: new Date(to),
  source: 'admin',
  reason: 'Invented grant',
});
const HELD = [
  { ...window('2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z'), kind: 'content', level: 'basic' },
  {
    ...window('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z'),
    kind: 'content',
    level: 'intermediate',
  },
  { ...window('2026-10-01T00:00:00Z', '2027-01-01T00:00:00Z'), kind: 'tool' },
] as Entitlement[];

describe('access status', () => {
  it('tells an active window, an ended one and none apart', () => {
    expect(contentStatus(HELD, 'basic', NOW)).toEqual({
      state: 'active',
      endsAt: new Date('2027-01-01T00:00:00Z'),
    });
    expect(contentStatus(HELD, 'intermediate', NOW)).toEqual({
      state: 'ended',
      endedAt: new Date('2026-04-01T00:00:00Z'),
    });
    expect(contentStatus(HELD, 'advance', NOW)).toEqual({ state: 'none' });
    expect(toolStatus(HELD, NOW).state).toBe('active');
    expect(toolStatus([], NOW)).toEqual({ state: 'none' });
  });
});
