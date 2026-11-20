import { cn } from '@/lib/cn';
import type { PramanTrace, TraceDebug } from '../../praman-trace';

/** An explanation line, its `code` parts set in mono. */
function Line({ text }: { text: string }) {
  return (
    <p>
      {text.split('`').map((part, i) =>
        i % 2 === 1 ? (
          <code key={i} className="rounded-[3px] bg-muted px-1 font-mono text-[12px]">
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

type WhyFailsProps = {
  trace: PramanTrace;
  cursor: number;
  onCycle: (cycle: number) => void;
  /** Asks what drove a signal (at the cursor). */
  onSignal: (path: string) => void;
};

/** Why the property fails (or how it is covered): Praman's account, then cycle by cycle. */
export function WhyFails({ trace, cursor, onCycle, onSignal }: WhyFailsProps) {
  const { debug } = trace;
  if (debug === null) {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[12px]">
        {trace.explanation || 'There is no account of this trace.'}
      </pre>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {debug.explanation.map((line) => (
        <Line key={line} text={line} />
      ))}
      <WhyTable
        debug={debug}
        isCover={trace.kind === 'COVER'}
        cursor={cursor}
        onCycle={onCycle}
        onSignal={onSignal}
      />
    </div>
  );
}

type TableRow = { text: string; role: string; values: (number | string | null)[]; path?: string };

const rowsOf = (debug: TraceDebug): TableRow[] => [
  ...debug.conditions,
  ...debug.locals.map((local) => ({ text: local.name, role: 'local', values: local.values })),
  ...debug.signals.map((s) => ({ text: s.name, role: 'signal', values: s.values, path: s.path })),
];

type WhyTableProps = Omit<WhyFailsProps, 'trace'> & { debug: TraceDebug; isCover: boolean };

function WhyTable({ debug, isCover, cursor, onCycle, onSignal }: WhyTableProps) {
  const rows = rowsOf(debug);
  if (rows.length === 0) return null;
  const from = debug.antecedent?.start ?? debug.trigger_cycle;
  const to = debug.antecedent?.end ?? debug.trigger_cycle;
  const column = (c: number) =>
    cn(
      'px-2 py-0.5 text-center',
      c === debug.event_cycle && (isCover ? 'bg-ok/15' : 'bg-danger/10'),
      !isCover && from !== null && to !== null && c >= from && c <= to && 'bg-warning/15',
      c === cursor && 'outline outline-1 outline-info',
    );
  return (
    <table className="mt-2 w-max border-collapse font-mono text-[12px]">
      <thead>
        <tr>
          <th className="px-2 text-left font-sans text-muted-foreground">cycle</th>
          {debug.cycles.map((c) => (
            <th key={c} className={column(c)}>
              <button type="button" title="Move the cursor here" onClick={() => onCycle(c)}>
                {c}
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <WhyRow
            key={`${row.role}:${row.text}`}
            row={row}
            debug={debug}
            isCover={isCover}
            column={column}
            onSignal={onSignal}
          />
        ))}
      </tbody>
    </table>
  );
}

const ROLE_CLASS: Readonly<Record<string, string>> = {
  antecedent: 'bg-warning',
  consequent: 'bg-info',
};
const ROLE_LABEL: Readonly<Record<string, string>> = {
  antecedent: 'ANTE',
  consequent: 'CONS',
  local: 'LOCAL',
};

type WhyRowProps = {
  row: TableRow;
  debug: TraceDebug;
  isCover: boolean;
  column: (c: number) => string;
  onSignal: (path: string) => void;
};

function WhyRow({ row, debug, isCover, column, onSignal }: WhyRowProps) {
  const isCondition = row.role !== 'signal' && row.role !== 'local';
  const cell = (v: number | string | null, c: number) => {
    if (!isCondition) return { text: v === null ? 'x' : String(v), className: '' };
    const failing = v === 0 && c === debug.event_cycle && !isCover && row.role !== 'antecedent';
    if (v === null) return { text: 'x', className: '' };
    return v === 1
      ? { text: 'true', className: 'text-ok' }
      : {
          text: failing ? 'FALSE' : 'false',
          className: failing ? 'font-bold text-danger' : 'text-muted-foreground',
        };
  };
  return (
    <tr>
      <td className="whitespace-nowrap px-2 py-0.5 text-left">
        {row.role !== 'signal' && (
          <span
            className={cn(
              'mr-1.5 rounded-[2px] px-1 font-sans text-[10px] font-bold text-background',
              ROLE_CLASS[row.role] ?? 'bg-muted-foreground',
            )}
          >
            {ROLE_LABEL[row.role] ?? 'COND'}
          </span>
        )}
        {row.path === undefined ? (
          row.text
        ) : (
          <button
            type="button"
            title="What drove it"
            onClick={() => onSignal(row.path ?? '')}
            className="underline decoration-dotted underline-offset-2"
          >
            {row.text}
          </button>
        )}
      </td>
      {debug.cycles.map((c) => {
        const { text, className } = cell(row.values[c] ?? null, c);
        return (
          <td key={c} className={cn(column(c), className)}>
            {text}
          </td>
        );
      })}
    </tr>
  );
}
