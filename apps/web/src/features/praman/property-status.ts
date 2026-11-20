import type { PramanProperty } from './praman-snapshot';

type Look = { label: string; className: string };

const DONE_WELL = 'border-success text-success';
const WRONG = 'border-destructive text-destructive';
const OPEN = 'border-warning text-warning';
const QUIET = 'border-border text-muted-foreground';

/** How a property's status shows in the table, with the site's status tokens. */
export const PROPERTY_LOOK: Readonly<Record<PramanProperty['status'], Look>> = {
  not_run: { label: 'Not run', className: QUIET },
  running: { label: 'Running', className: 'border-info text-info' },
  proven: { label: 'Proven', className: DONE_WELL },
  cex: { label: 'CEX', className: WRONG },
  covered: { label: 'Covered', className: DONE_WELL },
  unreachable: { label: 'Unreachable', className: OPEN },
  undetermined: { label: 'Undetermined', className: OPEN },
  vacuous: { label: 'Vacuous', className: OPEN },
  error: { label: 'Error', className: WRONG },
  stopped: { label: 'Stopped', className: QUIET },
  assumed: { label: 'Assumed', className: QUIET },
};

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
