'use client';

import type { ReactNode } from 'react';
import { downloadText } from '@/lib/download-text';
import type { View } from '../../hooks/use-visualize';
import {
  type Radix,
  type Signal,
  cycleTime,
  edgeFrom,
  formatValue,
  traceToVcd,
  valueAt,
} from '../../visualize';
import { SMALL_CONTROL } from '../small-control';
import { type BodyProps, TOOL } from './visualize-common';

const RADIXES: readonly { value: Radix; label: string }[] = [
  { value: 'hex', label: 'Hex' },
  { value: 'dec', label: 'Dec' },
  { value: 'signed', label: 'Signed' },
  { value: 'bin', label: 'Bin' },
];

type ToolsProps = BodyProps & {
  view: View;
  /** The chosen row's signal, when it is one. */
  signal: Signal | null;
  details: boolean;
  onDetails: () => void;
  onWhy: (path: string) => void;
};

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-1">{children}</div>;
}

function Tool({
  label,
  title,
  onClick,
  disabled = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={TOOL}>
      {label}
    </button>
  );
}

/** Zoom, the cursor, edges and why, what-if, the radix, export and the details. */
export function VisualizeTools(props: ToolsProps) {
  const { view, trace, details, onDetails } = props;
  return (
    <div
      role="toolbar"
      aria-label="Visualize tools"
      className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-1.5"
    >
      <Group>
        <Tool label="−" title="Zoom out" onClick={() => view.zoomBy(1 / 1.5)} />
        <Tool label="+" title="Zoom in" onClick={() => view.zoomBy(1.5)} />
        <Tool label="Fit" title="Fit the whole trace" onClick={view.fit} />
      </Group>
      <CursorTools {...props} />
      <SignalTools {...props} />
      {props.analysis?.whatIf === true && <WhatIfTools {...props} />}
      <RadixSelect view={view} />
      <Group>
        <Tool
          label="Export VCD"
          title="Save the trace for GTKWave or Surfer"
          onClick={() =>
            downloadText(
              `${trace.property || 'trace'}.vcd`,
              'text/plain',
              traceToVcd(trace.trace, trace.property),
            )
          }
        />
        <Tool
          label={details ? 'Hide details' : 'Show details'}
          title="Why it fails, the drivers and the why diagram"
          onClick={onDetails}
        />
      </Group>
    </div>
  );
}

function CursorTools({ view, cycles, trace }: ToolsProps) {
  const isCover = trace.kind === 'COVER';
  return (
    <Group>
      <Tool label="|◀" title="First cycle" onClick={() => view.moveCursor(0)} />
      <Tool label="◀" title="Previous cycle" onClick={() => view.moveCursor(view.cursor - 1)} />
      <span aria-live="polite" className="px-1">
        cycle <b className="text-info">{view.cursor}</b>
        {view.marker !== null && (
          <span title="From the second cursor (Shift+click a wave to move or remove it)">
            {' '}
            · Δ {Math.abs(view.cursor - view.marker)} from {view.marker}
          </span>
        )}
      </span>
      <Tool label="▶" title="Next cycle" onClick={() => view.moveCursor(view.cursor + 1)} />
      <Tool label="▶|" title="Last cycle" onClick={() => view.moveCursor(cycles.count - 1)} />
      {view.fail !== null && (
        <Tool
          label={isCover ? 'Go to cover' : 'Go to failure'}
          title={isCover ? 'The cycle the cover is reached in' : 'The cycle it fails in'}
          onClick={() => view.moveCursor(view.fail ?? 0)}
        />
      )}
    </Group>
  );
}

function SignalTools({ view, cycles, signal, analysis, onWhy }: ToolsProps) {
  const edge = (step: 1 | -1) => {
    const cycle = signal === null ? null : edgeFrom(cycles, signal, view.cursor, step);
    if (cycle !== null) view.moveCursor(cycle);
  };
  return (
    <Group>
      <Tool
        label="◀ Edge"
        title="Previous change of the selected signal"
        disabled={signal === null}
        onClick={() => edge(-1)}
      />
      <Tool
        label="Edge ▶"
        title="Next change of the selected signal"
        disabled={signal === null}
        onClick={() => edge(1)}
      />
      <Tool
        label="Why?"
        title="What drives the selected signal at the cursor"
        disabled={signal === null || analysis === undefined}
        onClick={() => signal !== null && onWhy(signal.fullName)}
      />
    </Group>
  );
}

function WhatIfTools({ view, cycles, signal, whatIf, trace }: ToolsProps) {
  const pin = () => {
    if (signal === null) return;
    const value = valueAt(signal, cycleTime(cycles, view.cursor));
    const radix = signal.width === 1 ? 'bin' : view.radix === 'signed' ? 'signed' : view.radix;
    whatIf.setDraft({
      signal: signal.fullName,
      cycle: view.cursor,
      value: formatValue(value, signal.width, radix),
      width: signal.width,
      radix,
    });
  };
  const isCover = trace.kind === 'COVER';
  return (
    <Group>
      <Tool
        label="Pin value"
        title="Hold the selected signal to a value at the cursor, then find a trace with it"
        disabled={signal === null || whatIf.status.busy}
        onClick={pin}
      />
      <Tool
        label={isCover ? 'Another trace' : 'Another counterexample'}
        title={
          isCover
            ? 'Another way to reach the cover'
            : 'A counterexample with other values of the inputs'
        }
        disabled={whatIf.status.busy}
        onClick={whatIf.another}
      />
      <Tool
        label="Quiet trace"
        title="The trace whose inputs change the fewest times"
        disabled={whatIf.status.busy}
        onClick={whatIf.quiet}
      />
    </Group>
  );
}

/** How buses are written: hex, decimal, signed or binary. */
function RadixSelect({ view }: { view: View }) {
  return (
    <select
      aria-label="Radix"
      title="How buses are shown"
      value={view.radix}
      onChange={(e) =>
        view.setRadix(RADIXES.find((r) => r.value === e.target.value)?.value ?? 'hex')
      }
      className={SMALL_CONTROL}
    >
      {RADIXES.map((radix) => (
        <option key={radix.value} value={radix.value}>
          {radix.label}
        </option>
      ))}
    </select>
  );
}
