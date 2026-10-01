import { describe, expect, it } from 'vitest';
import { visibleMark } from './watermark';

describe('visibleMark', () => {
  it('shows a short id, an email fragment and the date, never the full address', () => {
    const mark = visibleMark(
      { userId: '665f1c2e9b1d4a0012ab34cd', email: 'priya.sharma@example.test' },
      new Date('2026-11-15T10:00:00.000Z'),
    );
    expect(mark).toBe('ab34cd · pri…@example.test · 2026-11-15');
    expect(mark).not.toContain('priya.sharma');
  });
});
