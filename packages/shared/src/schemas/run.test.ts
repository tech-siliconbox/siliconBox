import { describe, expect, it } from 'vitest';
import { RUN_PROPERTIES_MAX_BYTES, RunInputSchema, drillSolved } from './run';

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

describe('drillSolved', () => {
  const grading = (met: number, state: 'pending' | 'done' = 'done') =>
    ({ kind: 'bugVariants', state, total: 2, met }) as const;

  it('needs the target on the visible design', () => {
    expect(drillSolved('PASS', 'FAIL', null)).toBe(false);
    expect(drillSolved('FAIL', 'TIMEOUT', null)).toBe(false);
    expect(drillSolved('FAIL', 'ERROR', grading(2))).toBe(false);
    expect(drillSolved('PASS', null, null)).toBeNull();
  });

  it('needs every hidden design to give its expected answer', () => {
    expect(drillSolved('PASS', 'PASS', grading(2))).toBe(true);
    expect(drillSolved('PASS', 'PASS', grading(1))).toBe(false);
    expect(drillSolved('FAIL', 'FAIL', grading(0))).toBe(false);
  });

  it('is unknown while grading runs, and falls back to the visible design without hidden ones', () => {
    expect(drillSolved('PASS', 'PASS', grading(0, 'pending'))).toBeNull();
    expect(drillSolved('FAIL', 'FAIL', null)).toBe(true);
  });
});
