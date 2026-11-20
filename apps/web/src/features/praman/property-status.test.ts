import { describe, expect, it } from 'vitest';
import { PramanPropertySchema } from './praman-snapshot';
import { propertyCounts } from './property-status';

const property = (name: string, status: string, related = '') =>
  PramanPropertySchema.parse({ id: name, name, type: 'assert', instance: 'u', status, related });

describe('propertyCounts', () => {
  it("counts the table's own properties, not related covers or assumptions", () => {
    const counts = propertyCounts([
      property('a_flags', 'proven'),
      property('a_no_overflow', 'cex'),
      property('a_no_overflow:witness1', 'covered', 'witness'),
      property('c_full', 'covered'),
      property('m_valid', 'assumed'),
      property('a_late', 'undetermined'),
      property('a_new', 'not_run'),
    ]);
    expect(counts).toEqual({ pass: 2, fail: 1, open: 1, todo: 1 });
  });
});
