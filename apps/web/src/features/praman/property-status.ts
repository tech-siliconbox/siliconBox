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
