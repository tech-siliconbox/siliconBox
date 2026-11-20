import type { ReactNode } from 'react';
import type { PramanProperty } from '../praman-snapshot';

type Status = PramanProperty['status'];

/** Each status in words, for the icon's name and the row's tooltip. */
export const STATUS_LABEL: Readonly<Record<Status, string>> = {
  not_run: 'Not run',
  running: 'Running',
  proven: 'Proven',
  cex: 'Counterexample (cex)',
  covered: 'Covered',
  unreachable: 'Unreachable',
  undetermined: 'Undetermined',
  vacuous: 'Proven, but vacuous',
  error: 'Cannot be checked',
  stopped: 'Stopped',
  assumed: 'Assumption',
};

const LINE = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** A question mark, in full class names (Tailwind finds only classes written out whole). */
const question = (stroke: string, fill: string) => (
  <>
    <path
      d="M5.4 6.1a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3.9-1.3 1.8"
      className={stroke}
      strokeWidth="2"
      {...LINE}
    />
    <circle cx="8" cy="13" r="1.1" className={fill} />
  </>
);

const GLYPHS: Readonly<Record<Status, ReactNode>> = {
  proven: <path d="M2.5 8.5l3.5 3.5 7.5-8" className="stroke-ok" strokeWidth="2.2" {...LINE} />,
  covered: (
    <path
      d="M1.5 8.5l3 3.2 4-5.2 2.2 2.6 3.6-5.3"
      className="stroke-ok"
      strokeWidth="2"
      {...LINE}
    />
  ),
  vacuous: (
    <>
      <path d="M2.5 8.5l3.5 3.5 7.5-8" className="stroke-warning" strokeWidth="2.2" {...LINE} />
      <circle cx="13" cy="12.5" r="1.4" className="fill-warning" />
    </>
  ),
  cex: (
    <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" className="stroke-danger" strokeWidth="2.4" {...LINE} />
  ),
  unreachable: (
    <>
      <circle cx="8" cy="8" r="5.6" className="stroke-danger" strokeWidth="1.8" {...LINE} />
      <path d="M4.2 11.8l7.6-7.6" className="stroke-danger" strokeWidth="1.8" {...LINE} />
    </>
  ),
  error: (
    <>
      <path d="M8 1.8l6.6 11.8H1.4z" className="stroke-danger" strokeWidth="1.6" {...LINE} />
      <path d="M8 6.2v3.6" className="stroke-danger" strokeWidth="1.7" {...LINE} />
      <circle cx="8" cy="11.8" r=".95" className="fill-danger" />
    </>
  ),
  undetermined: question('stroke-warning', 'fill-warning'),
  running: (
    <>
      <circle cx="8" cy="8" r="5.5" className="stroke-info-light" strokeWidth="2.2" {...LINE} />
      <path
        d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5"
        className="origin-center animate-spin stroke-info"
        strokeWidth="2.2"
        {...LINE}
      />
    </>
  ),
  stopped: <rect x="4" y="4" width="8" height="8" rx="1" className="fill-muted-foreground" />,
  assumed: <path d="M4 8h8" className="stroke-muted-foreground" strokeWidth="2" {...LINE} />,
  not_run: question('stroke-muted-foreground', 'fill-muted-foreground'),
};

/** A property's status as Praman draws it: a tick, a cross, a question mark, a spinner… */
export function StatusIcon({ status, size = 15 }: { status: Status; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      aria-label={STATUS_LABEL[status]}
      className="shrink-0"
    >
      {GLYPHS[status]}
    </svg>
  );
}
