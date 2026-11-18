import { describe, expect, it } from 'vitest';
import { gradingPlan, gradingView } from './grading';

const hidden = {
  referenceDesign: 'module ok; endmodule',
  bugVariants: [{ code: 'a' }, { code: 'b' }],
};

describe('gradingPlan', () => {
  it('runs every seeded bug on a PASS Drill, each expected to FAIL', () => {
    expect(gradingPlan('PASS', hidden)).toEqual({
      kind: 'bugVariants',
      planned: [
        { design: 'a', expect: 'FAIL' },
        { design: 'b', expect: 'FAIL' },
      ],
    });
  });

  it('runs the correct design on a FAIL Drill, expected to PASS', () => {
    expect(gradingPlan('FAIL', hidden)).toEqual({
      kind: 'correctDesign',
      planned: [{ design: 'module ok; endmodule', expect: 'PASS' }],
    });
  });

  it('has nothing to grade without hidden designs', () => {
    expect(gradingPlan('PASS', null)).toEqual({ kind: null, planned: [] });
    expect(gradingPlan('FAIL', { referenceDesign: null, bugVariants: [] })).toEqual({
      kind: null,
      planned: [],
    });
  });
});

describe('gradingView', () => {
  const job = (expect: 'PASS' | 'FAIL', status: 'PASS' | 'FAIL' | 'TIMEOUT' | null) => ({
    hash: 'h',
    expect,
    jobId: null,
    status,
  });

  it('counts the hidden designs answered as expected, and is pending until all are back', () => {
    expect(
      gradingView({ kind: 'bugVariants', jobs: [job('FAIL', 'FAIL'), job('FAIL', null)] }),
    ).toEqual({ kind: 'bugVariants', state: 'pending', total: 2, met: 1 });
    expect(
      gradingView({ kind: 'bugVariants', jobs: [job('FAIL', 'FAIL'), job('FAIL', 'TIMEOUT')] }),
    ).toEqual({ kind: 'bugVariants', state: 'done', total: 2, met: 1 });
  });

  it('shows nothing when there was nothing to grade', () => {
    expect(gradingView(null)).toBeNull();
    expect(gradingView({ kind: null, jobs: [] })).toBeNull();
  });
});
