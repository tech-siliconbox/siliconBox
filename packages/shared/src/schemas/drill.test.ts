import { describe, expect, it } from 'vitest';
import { TOP_MODULE_PATTERN, drillLimitProblem } from './drill';

describe('drillLimitProblem', () => {
  it('accepts settings exactly at the cap', () => {
    expect(drillLimitProblem('basic', { depth: 40, timeoutSeconds: 60 })).toBeNull();
  });

  it.each([
    ['basic', { depth: 41, timeoutSeconds: 60 }, /Depth 41/],
    ['basic', { depth: 10, timeoutSeconds: 61 }, /Timeout 61s/],
    ['intermediate', { depth: 81, timeoutSeconds: 10 }, /intermediate cap of 80/],
  ] as const)('refuses %s with %o', (level, settings, message) => {
    expect(drillLimitProblem(level, settings)).toMatch(message);
  });

  it('allows a higher level a deeper search', () => {
    expect(drillLimitProblem('advance', { depth: 150, timeoutSeconds: 300 })).toBeNull();
  });
});

describe('TOP_MODULE_PATTERN', () => {
  it.each(['top', 'formal_tb', 'fifo_props2'])('accepts %s', (name) => {
    expect(TOP_MODULE_PATTERN.test(name)).toBe(true);
  });

  it.each(['', '2top', 'top; exec', 'top\nread -sv evil.sv', 'a'.repeat(65)])(
    'refuses %j',
    (name) => {
      expect(TOP_MODULE_PATTERN.test(name)).toBe(false);
    },
  );
});
