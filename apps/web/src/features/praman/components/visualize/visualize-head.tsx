import { cn } from '@/lib/cn';
import type { PramanTrace, TraceKind } from '../../praman-trace';
import { type Cycles, isInternal } from '../../visualize';

const KIND: Readonly<Record<TraceKind, { label: string; at: string; className: string }>> = {
  ASSERT: { label: 'Counterexample', at: 'fails at cycle', className: 'bg-danger' },
  COVER: { label: 'Cover trace', at: 'covered at cycle', className: 'bg-ok' },
  LIVE: {
    label: 'Liveness counterexample',
    at: 'pending forever from cycle',
    className: 'bg-danger',
  },
  EQUIV: {
    label: 'Equivalence counterexample',
    at: 'the designs differ at cycle',
    className: 'bg-danger',
  },
};

type VisualizeHeadProps = {
  title: string;
  /** The trace shown, with its cycles; null while it is read. */
  shown: { trace: PramanTrace; cycles: Cycles } | null;
  /** How a what-if trace shown instead of the property's own was asked for. */
  edited: string | null;
  onOriginal: () => void;
  onClose: () => void;
};

/** Visualize's title: the kind of trace, the property, where it fails, how long and how wide. */
export function VisualizeHead({ title, shown, edited, onOriginal, onClose }: VisualizeHeadProps) {
  const kind = shown === null ? null : KIND[shown.trace.kind];
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-border bg-muted px-3">
      <span className="font-bold text-info">Visualize</span>
      {kind !== null && (
        <span
          className={cn(
            'rounded-[3px] px-2 py-0.5 text-[12px] font-semibold text-background',
            kind.className,
          )}
        >
          {kind.label}
        </span>
      )}
      {edited !== null && (
        <>
          <span className="rounded-[3px] bg-info-light px-2 py-0.5 text-[12px] font-semibold text-info">
            {edited}
          </span>
          <button
            type="button"
            onClick={onOriginal}
            className="text-[12px] font-semibold underline underline-offset-2"
          >
            Original trace
          </button>
        </>
      )}
      <h2 className="font-mono font-semibold">{nameOf(shown, title)}</h2>
      {shown !== null && <Facts shown={shown} />}
      <button
        type="button"
        aria-label="Close"
        title="Close (Esc)"
        onClick={onClose}
        className="ml-auto px-2 text-[16px] text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}

type Shown = NonNullable<VisualizeHeadProps['shown']>;

const nameOf = (shown: VisualizeHeadProps['shown'], title: string) =>
  shown === null || shown.trace.property === '' ? title : shown.trace.property;

/** Where it fails (or is covered), how many cycles, how many signals. */
function Facts({ shown }: { shown: Shown }) {
  const { trace, cycles } = shown;
  const at =
    trace.failCycle === null
      ? ''
      : `${KIND[trace.kind].at} ${Math.min(trace.failCycle, cycles.count - 1)} · `;
  const signals = cycles.signals.filter((s) => !isInternal(s.fullName)).length;
  return (
    <span className="text-muted-foreground">
      {at}
      {cycles.count} cycles · {signals} signals
    </span>
  );
}
