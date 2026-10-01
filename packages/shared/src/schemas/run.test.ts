import { describe, expect, it } from 'vitest';
import { RUN_PROPERTIES_MAX_BYTES, RunInputSchema, isDrillSolved } from './run';

const REQUEST_ID = '6f1c1d38-2f6b-4b0e-9c51-2d7d1c1f7a10';

describe('RunInputSchema', () => {
  it('accepts properties and a request id', () => {
    const input = { properties: 'module p(); endmodule', requestId: REQUEST_ID };
    expect(RunInputSchema.parse(input)).toEqual(input);
  });

  it.each([
    ['settings the learner may not choose', { depth: 999 }],
    ['a solver', { solver: 'z3' }],
    ['a top module', { topModule: 'evil' }],
    ['a timeout', { timeoutSeconds: 3600 }],
  ])('refuses %s', (_, extra) => {
    const input = { properties: 'x', requestId: REQUEST_ID, ...extra };
    expect(RunInputSchema.safeParse(input).success).toBe(false);
  });

  it('measures the size limit in bytes, not characters', () => {
    const wide = 'é'.repeat(RUN_PROPERTIES_MAX_BYTES / 2 + 1); // two bytes each
    expect(RunInputSchema.safeParse({ properties: wide, requestId: REQUEST_ID }).success).toBe(
      false,
    );
  });

  it('needs a UUID request id', () => {
    expect(RunInputSchema.safeParse({ properties: 'x', requestId: '1' }).success).toBe(false);
  });
});

describe('isDrillSolved', () => {
  it('needs PASS on a PASS Drill and FAIL on a FAIL Drill', () => {
    expect(isDrillSolved('PASS', 'PASS')).toBe(true);
    expect(isDrillSolved('PASS', 'FAIL')).toBe(false);
    expect(isDrillSolved('FAIL', 'FAIL')).toBe(true);
    expect(isDrillSolved('FAIL', 'TIMEOUT')).toBe(false);
    expect(isDrillSolved('FAIL', 'ERROR')).toBe(false);
  });
});
