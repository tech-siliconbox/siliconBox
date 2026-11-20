'use client';

import type { MouseEvent, ReactNode, RefObject } from 'react';
import { BitWave, BusWave, type ShapeRun } from '@/components/shared/wave-shapes';
import { cn } from '@/lib/cn';
import type { View } from '../../hooks/use-visualize';
import type { TraceDebug } from '../../praman-trace';
import { ExprError } from '../../trace-expr';
import {
  type Cycles,
  type Row,
  cycleTime,
  expressionValues,
  formatValue,
  resetCycles,
  segmentsOf,
  valueAt,
  xOf,
} from '../../visualize';
import type { BodyProps } from './visualize-common';

const ROW = 24;

/** What every row marks behind its wave: reset, the trigger, the failure and the cursor. */
type Marks = {
  reset: boolean[];
  trigger: [number, number] | null;
  fail: number | null;
  cursor: number;
  zoom: number;
  count: number;
};

const triggerOf = (debug: TraceDebug | null): [number, number] | null =>
  debug?.antecedent
    ? [debug.antecedent.start, debug.antecedent.end]
    : debug?.trigger_cycle == null
      ? null
      : [debug.trigger_cycle, debug.trigger_cycle];

type TableProps = BodyProps & { view: View; waves: RefObject<HTMLDivElement | null> };

/** The signals on the left with their value at the cursor, their waves on a cycle ruler. */
export function WaveTable(props: TableProps) {
  const { view, cycles, trace, top, reset, waves } = props;
  const marks: Marks = {
    reset: resetCycles(cycles, top, reset),
    trigger: triggerOf(trace.debug),
    fail: view.fail,
    cursor: view.cursor,
    zoom: view.zoom,
    count: cycles.count,
  };
  return (
    <div ref={waves} className="min-h-0 flex-1 overflow-auto font-mono text-[12px]">
      <Ruler marks={marks} />
      {view.rows.map((row) => (
        <WaveRow key={row.key} row={row} marks={marks} {...props} />
      ))}
    </div>
  );
}

function Ruler({ marks }: { marks: Marks }) {
  return (
    <div className="sticky top-0 z-20 flex h-[26px] w-max border-b border-border bg-muted font-sans">
      <div className="sticky left-0 z-10 flex w-[300px] shrink-0 items-center justify-between border-r border-border bg-muted px-2 font-semibold text-muted-foreground">
        <span>Signal</span>
        <span>Value @ {marks.cursor}</span>
      </div>
      <svg aria-hidden="true" width={marks.count * marks.zoom} height={26}>
        {Array.from({ length: marks.count }, (_, c) => (
          <text
            key={c}
            x={(c + 0.5) * marks.zoom}
            y={17}
            textAnchor="middle"
            className={cn(
              'text-[11px]',
              c === marks.cursor ? 'fill-info font-bold' : 'fill-muted-foreground',
            )}
          >
            {c}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** The marks behind every wave: reset cycles shaded, the trigger and the failure, the cursor. */
function Backdrop({ marks }: { marks: Marks }) {
  const band = (from: number, to: number, className: string) => (
    <rect
      x={from * marks.zoom}
      y={0}
      width={(to - from + 1) * marks.zoom}
      height={ROW}
      className={className}
    />
  );
  return (
    <>
      {marks.reset.map((held, c) =>
        held ? <g key={`r${c}`}>{band(c, c, 'fill-muted')}</g> : null,
      )}
      {marks.trigger !== null && band(marks.trigger[0], marks.trigger[1], 'fill-warning/15')}
      {marks.fail !== null && band(marks.fail, marks.fail, 'fill-danger/10')}
      <line
        x1={(marks.cursor + 0.5) * marks.zoom}
        x2={(marks.cursor + 0.5) * marks.zoom}
        y1={0}
        y2={ROW}
        className="stroke-info [stroke-width:1.5]"
      />
    </>
  );
}

type RowProps = TableProps & { row: Row; marks: Marks };

type RowLabelProps = { row: Row; view: View; chosen: boolean; name: ReactNode; value: string };

/** A row's name (choose it), its value at the cursor, and (but for the property's own) remove. */
function RowLabel({ row, view, chosen, name, value }: RowLabelProps) {
  return (
    <div
      className={cn(
        'sticky left-0 z-10 flex w-[300px] shrink-0 items-center gap-1 border-r border-border px-2',
        chosen ? 'bg-info-light' : 'bg-background',
      )}
    >
      <button
        type="button"
        aria-pressed={chosen}
        onClick={() => view.setSelected(chosen ? null : row.key)}
        className="min-w-0 flex-1 truncate text-left"
      >
        {name}
      </button>
      <span className="text-info">{value}</span>
      {row.kind !== 'cond' && (
        <button
          type="button"
          aria-label="Remove this row"
          onClick={() => view.setRows(view.rows.filter((each) => each.key !== row.key))}
          className="px-1 text-muted-foreground hover:text-danger"
        >
          ×
        </button>
      )}
    </div>
  );
}

function WaveRow(props: RowProps) {
  const { row, view } = props;
  if (row.kind === 'group') {
    return (
      <div className="flex h-6 w-max min-w-full items-center bg-muted/60 font-sans font-semibold text-muted-foreground">
        <span className="sticky left-0 px-2">{row.label}</span>
      </div>
    );
  }
  const chosen = view.selected === row.key;
  const { name, value, wave } = rowParts(props);
  const move = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    view.moveCursor(Math.floor((event.clientX - box.left) / view.zoom));
  };
  return (
    <div className={cn('flex h-6 w-max border-b border-border/50', chosen && 'bg-info-light')}>
      <RowLabel row={row} view={view} chosen={chosen} name={name} value={value} />
      <button
        type="button"
        aria-label="Move the cursor here"
        onClick={move}
        className="block cursor-crosshair"
      >
        <svg
          aria-hidden="true"
          width={props.marks.count * view.zoom}
          height={ROW}
          className="block"
        >
          <Backdrop marks={props.marks} />
          {wave}
        </svg>
      </button>
    </div>
  );
}

const ROLE: Readonly<Record<string, { label: string; className: string }>> = {
  antecedent: { label: 'ANTE', className: 'bg-warning' },
  consequent: { label: 'CONS', className: 'bg-info' },
  local: { label: 'LOCAL', className: 'bg-muted-foreground' },
};

/** A row's name, its value at the cursor, and its wave. */
function rowParts({ row, cycles, view, top, marks }: RowProps): {
  name: ReactNode;
  value: string;
  wave: ReactNode;
} {
  if (row.kind === 'group') return { name: row.label, value: '', wave: null };
  if (row.kind === 'cond') return conditionParts(row, marks);
  if (row.kind === 'expr') return expressionParts(row.text, cycles, view, top);
  const signal = cycles.byPath.get(row.path);
  if (signal === undefined) return { name: row.path, value: '', wave: null };
  const runs = segmentsOf(cycles, signal).map((s) => ({
    x0: xOf(cycles, s.from, view.zoom),
    x1: xOf(cycles, s.to, view.zoom),
    value: s.value,
  }));
  return {
    name: top !== '' && row.path.startsWith(`${top}.`) ? row.path.slice(top.length + 1) : row.path,
    value: formatValue(valueAt(signal, cycleTime(cycles, view.cursor)), signal.width, view.radix),
    wave: waveOf(fixEnd(runs, marks), signal.width, view),
  };
}

/** The last run reaches the end of the last cycle. */
const fixEnd = (runs: ShapeRun[], marks: Marks) =>
  runs.map((run, i) => (i === runs.length - 1 ? { ...run, x1: marks.count * marks.zoom } : run));

const waveOf = (runs: ShapeRun[], width: number, view: View) =>
  width === 1 ? (
    <BitWave runs={runs} height={ROW} className="stroke-ok" />
  ) : (
    <BusWave runs={runs} height={ROW} label={(v) => formatValue(v, width, view.radix)} />
  );

function conditionParts(row: Extract<Row, { kind: 'cond' }>, marks: Marks) {
  const role = ROLE[row.role] ?? { label: 'COND', className: 'bg-muted-foreground' };
  const at = row.values[marks.cursor];
  return {
    name: (
      <>
        <span
          className={cn(
            'mr-1.5 rounded-[2px] px-1 font-sans text-[10px] font-bold text-background',
            role.className,
          )}
        >
          {role.label}
        </span>
        {row.label}
      </>
    ),
    value: at == null ? 'x' : at === 1 ? 'true' : 'false',
    wave: row.values.slice(0, marks.count).map((v, c) => {
      const failing = c === marks.fail && v === 0 && row.role !== 'antecedent';
      if (v == null)
        return (
          <rect
            key={c}
            x={c * marks.zoom}
            y={4}
            width={marks.zoom}
            height={ROW - 9}
            className="fill-danger/15"
          />
        );
      return (
        <rect
          key={c}
          x={c * marks.zoom + 0.5}
          y={v === 1 ? 4 : ROW - 8}
          width={Math.max(1, marks.zoom - 1)}
          height={v === 1 ? ROW - 9 : 3}
          className={failing ? 'fill-danger' : v === 1 ? 'fill-ok/50' : 'fill-muted-foreground/40'}
        />
      );
    }),
  };
}

function expressionParts(text: string, cycles: Cycles, view: View, top: string) {
  try {
    const { width, bits } = expressionValues(cycles, top, text);
    const runs: ShapeRun[] = [];
    bits.forEach((value, c) => {
      const last = runs.at(-1);
      if (last?.value === value) last.x1 = (c + 1) * view.zoom;
      else runs.push({ x0: c * view.zoom, x1: (c + 1) * view.zoom, value });
    });
    const at = bits[view.cursor] ?? 'x';
    return {
      name: text,
      value: formatValue(at, width, view.radix),
      wave: waveOf(runs, width, view),
    };
  } catch (error) {
    return { name: text, value: error instanceof ExprError ? 'error' : 'x', wave: null };
  }
}
