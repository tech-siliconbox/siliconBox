import type { PramanProperty } from './praman-snapshot';

type Tally = 'pass' | 'fail' | 'open' | 'todo';

const TALLY: Readonly<Record<PramanProperty['status'], Tally | null>> = {
  proven: 'pass',
  covered: 'pass',
  cex: 'fail',
  unreachable: 'fail',
  vacuous: 'fail',
  error: 'fail',
  undetermined: 'open',
  stopped: 'open',
  running: 'open',
  not_run: 'todo',
  assumed: null,
};

/** The status bar's counts: the table's own properties (not related covers or assumptions). */
export function propertyCounts(properties: readonly PramanProperty[]): Record<Tally, number> {
  const counts: Record<Tally, number> = { pass: 0, fail: 0, open: 0, todo: 0 };
  for (const property of properties) {
    const tally = property.related === '' ? TALLY[property.status] : null;
    if (tally !== null) counts[tally] += 1;
  }
  return counts;
}
