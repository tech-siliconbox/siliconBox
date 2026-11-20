import { describe, expect, it } from 'vitest';
import { PramanPropertySchema } from './praman-snapshot';
import {
  type RowQuery,
  boundText,
  instanceRollup,
  propertyRows,
  resultCounts,
  timeText,
} from './property-rows';

const prop = (id: string, fields: object = {}) =>
  PramanPropertySchema.parse({
    id,
    name: `fifo.u.${id}`,
    type: 'assert',
    instance: 'fifo.u',
    ...fields,
  });

const PROPERTIES = [
  prop('a_no_overflow', { status: 'cex', bound: 8, seconds: 27.6 }),
  prop('a_no_overflow:precondition1', {
    type: 'cover',
    parent: 'a_no_overflow',
    related: 'precondition',
    status: 'covered',
  }),
  prop('c_full', { type: 'cover', status: 'covered', bound: 1 }),
  prop('a_flags', { status: 'proven' }),
  prop('m_valid', { type: 'assume', status: 'assumed', instance: 'fifo' }),
];

const QUERY: RowQuery = {
  result: 'all',
  type: 'all',
  text: '',
  instance: '',
  showRelated: true,
  sort: null,
};
const ids = (query: Partial<RowQuery>) =>
  propertyRows(PROPERTIES, { ...QUERY, ...query }).map((r) => r.property.id);

describe('the property table rows', () => {
  it('puts related covers under their assertion, and hides them when asked', () => {
    expect(ids({})).toEqual([
      'a_no_overflow',
      'a_no_overflow:precondition1',
      'c_full',
      'a_flags',
      'm_valid',
    ]);
    expect(ids({ showRelated: false })).toEqual(['a_no_overflow', 'c_full', 'a_flags', 'm_valid']);
  });

  it('filters by result, type, name and instance', () => {
    expect(ids({ result: 'fail', showRelated: false })).toEqual(['a_no_overflow']);
    expect(ids({ type: 'cover' })).toEqual(['c_full']);
    expect(ids({ text: 'FLAGS' })).toEqual(['a_flags']);
    expect(ids({ instance: 'fifo.u', showRelated: false })).toEqual([
      'a_no_overflow',
      'c_full',
      'a_flags',
    ]);
  });

  it('sorts by a column, worst status first', () => {
    expect(ids({ sort: { key: 'status', dir: 1 }, showRelated: false })).toEqual([
      'a_no_overflow',
      'c_full',
      'a_flags',
      'm_valid',
    ]);
  });

  it('counts each result, and rolls an instance up to its worst status', () => {
    expect(resultCounts(PROPERTIES, false)).toEqual({ all: 4, fail: 1, open: 0, pass: 2, todo: 0 });
    expect(instanceRollup(PROPERTIES, 'fifo')).toEqual({ count: 4, worst: 'cex' });
  });

  it('shows bounds and times as Praman does', () => {
    const [overflow, , , flags] = PROPERTIES;
    expect(flags && boundText(flags)).toBe('Infinite');
    expect(overflow && boundText(overflow)).toBe('8');
    expect(timeText(27.6)).toBe('27.6');
    expect(timeText(125)).toBe('2:05');
    expect(timeText(3725)).toBe('1:02:05');
  });
});
