import { describe, expect, it } from 'vitest';
import { diffProperties } from './runs';

const result = (name: string, status: string, type = 'assert') => ({
  id: name,
  name,
  type,
  status,
});
const AGAINST = '0b1e7c1a-3a5e-4c55-9d6c-7f8a9b0c1d2e_r1';

describe('diffProperties', () => {
  it('lists the properties whose result changed, were added or were removed', () => {
    const before = [
      result('a_flags', 'proven'),
      result('a_no_overflow', 'cex'),
      result('c_old', 'covered', 'cover'),
    ];
    const after = [
      result('a_flags', 'proven'),
      result('a_no_overflow', 'proven'),
      result('c_full', 'covered', 'cover'),
    ];
    expect(diffProperties(after, before, AGAINST)).toEqual({
      against: AGAINST,
      changed: [{ name: 'a_no_overflow', type: 'assert', before: 'cex', after: 'proven' }],
      added: [{ name: 'c_full', type: 'cover', after: 'covered' }],
      removed: [{ name: 'c_old', type: 'cover', before: 'covered' }],
    });
  });

  it('leaves out records that are not results', () => {
    expect(diffProperties([{ name: 'x' }], [], AGAINST).added).toEqual([]);
  });
});
