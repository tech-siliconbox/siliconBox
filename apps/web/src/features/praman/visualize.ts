import type { Trace } from '@siliconbox/shared';
import type { Reset } from './praman-snapshot';
import type { TraceDebug } from './praman-trace';
import { ExprError, type Read, evaluate, fromBits, parse, toBits } from './trace-expr';

// Visualize's model of a trace, as Praman's Visualize window reads it: cycles (smtbmc writes the
// step number as `smt_step`), each signal's value at a time and in a radix, the rows shown first,
// the cycles the reset holds, and the trace as a VCD file for GTKWave or Surfer.

export type Signal = Trace['signals'][number];
export type Radix = 'hex' | 'dec' | 'signed' | 'bin';

export type Cycles = {
  signals: Signal[];
  byPath: ReadonlyMap<string, Signal>;
  /** When each cycle starts, in the trace's time. */
  starts: number[];
  /** A cycle's length in time. */
  period: number;
  count: number;
};

/** The checker's, the harness's and Praman's own signals: shown only when asked for. */
const INTERNAL = /(^|\.)__va_|(^|\.)__pm_|^smt_|(^|\.)\$/;
export const isInternal = (path: string) => INTERNAL.test(path);

const uniqueSorted = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);

export function cyclesOf(trace: Trace): Cycles {
  const byPath = new Map(trace.signals.map((signal) => [signal.fullName, signal]));
  const step = trace.signals.find((signal) => signal.name === 'smt_step');
  const fromStep = uniqueSorted(step?.transitions.map((t) => t.time) ?? []);
  const starts =
    fromStep.length > 0
      ? fromStep
      : uniqueSorted(trace.timepoints.length > 0 ? trace.timepoints : [0]);
  const period = starts.length > 1 ? (starts[1] ?? 1) - (starts[0] ?? 0) : 1;
  return { signals: trace.signals, byPath, starts, period, count: starts.length };
}

/** The index of the last item at or before `time` (binary search), or -1. */
function lastAtOrBefore<T>(list: readonly T[], time: number, key: (item: T) => number): number {
  let lo = 0;
  let hi = list.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = list[mid];
    if (item !== undefined && key(item) <= time) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

export function valueAt(signal: Signal, time: number): string {
  const at = lastAtOrBefore(signal.transitions, time, (t) => t.time);
  return signal.transitions[at]?.value ?? 'x';
}

export const cycleTime = (cycles: Cycles, cycle: number) =>
  cycles.starts[Math.max(0, Math.min(cycle, cycles.count - 1))] ?? 0;

/** Where a time falls on the cycle ruler, in pixels at `zoom` pixels a cycle. */
export function xOf(cycles: Cycles, time: number, zoom: number): number {
  const at = Math.max(
    0,
    lastAtOrBefore(cycles.starts, time, (t) => t),
  );
  const start = cycles.starts[at] ?? 0;
  const part = Math.min(1, Math.max(0, (time - start) / (cycles.period || 1)));
  return (at + part) * zoom;
}

/** A value's bits at its width (the VCD leaves out leading zeros). */
function bitsOf(value: string, width: number): string {
  const v = value.toLowerCase();
  if (v.length >= width) return v.slice(-width);
  const fill = v.startsWith('x') || v.startsWith('z') ? (v[0] ?? '0') : '0';
  return v.padStart(width, fill);
}

function hexWithUnknowns(bits: string): string {
  let out = '';
  for (let end = bits.length; end > 0; end -= 4) {
    const nibble = bits.slice(Math.max(0, end - 4), end);
    out =
      (nibble.includes('x') ? 'x' : nibble.includes('z') ? 'z' : parseInt(nibble, 2).toString(16)) +
      out;
  }
  return out;
}

/** A value as the waveform shows it: one bit as is, a bus in the chosen radix. */
export function formatValue(value: string, width: number, radix: Radix): string {
  if (width <= 1) return value.toLowerCase().slice(-1);
  const bits = bitsOf(value, width);
  if (radix === 'bin') return bits;
  if (/[^01]/.test(bits)) {
    if (radix === 'hex') return hexWithUnknowns(bits);
    return /^z+$/.test(bits) ? 'z' : 'x';
  }
  const n = BigInt(`0b${bits}`);
  if (radix === 'dec') return n.toString();
  if (radix === 'signed') return (bits.startsWith('1') ? n - (1n << BigInt(width)) : n).toString();
  return n.toString(16);
}

export type Segment = { from: number; to: number; value: string };

/** A signal's runs of one value, in time, up to the end of the last cycle. */
export function segmentsOf(cycles: Cycles, signal: Signal): Segment[] {
  const end = cycleTime(cycles, cycles.count - 1) + cycles.period;
  const out: Segment[] = [];
  let value = 'x';
  let from = cycles.starts[0] ?? 0;
  for (const change of signal.transitions.filter((t) => t.time < end)) {
    if (change.time > from) out.push({ from, to: change.time, value });
    from = Math.max(from, change.time);
    value = change.value;
  }
  out.push({ from, to: end, value });
  return out;
}

/** The next (or previous, `step` -1) cycle where the signal's value differs from the cursor's. */
export function edgeFrom(
  cycles: Cycles,
  signal: Signal,
  cursor: number,
  step: 1 | -1,
): number | null {
  const here = valueAt(signal, cycleTime(cycles, cursor));
  for (let c = cursor + step; c >= 0 && c < cycles.count; c += step) {
    if (valueAt(signal, cycleTime(cycles, c)) !== here) return c;
  }
  return null;
}

/** Per cycle, whether the reset is held (those cycles are hatched; checks are off there). */
export function resetCycles(cycles: Cycles, top: string, reset: Reset | null): boolean[] {
  const signal = reset === null ? undefined : cycles.byPath.get(`${top}.${reset.signal}`);
  if (signal === undefined || reset === null) return [];
  const active = reset.active_low ? '0' : '1';
  return cycles.starts.map((time) => valueAt(signal, time).slice(-1) === active);
}

export type Row =
  | { key: string; kind: 'group'; label: string }
  | { key: string; kind: 'cond'; label: string; role: string; values: (number | null)[] }
  | { key: string; kind: 'signal'; path: string }
  | { key: string; kind: 'expr'; text: string };

/** The property's conditions and the signals it reads, then the top module's own signals. */
export function defaultRows(cycles: Cycles, debug: TraceDebug | null, top: string): Row[] {
  const rows: Row[] = [];
  const shown = new Set<string>();
  const add = (path: string) => {
    if (shown.has(path) || !cycles.byPath.has(path)) return;
    shown.add(path);
    rows.push({ key: `s:${path}`, kind: 'signal', path });
  };
  if (debug !== null) propertyRows(debug, rows, add);
  const topLevel = topSignals(cycles, top).filter((s) => !shown.has(s.fullName));
  if (topLevel.length > 0) {
    rows.push({ key: 'g:top', kind: 'group', label: top === '' ? 'Signals' : `Top: ${top}` });
    topLevel.forEach((s) => add(s.fullName));
  }
  return rows;
}

/** The Property group: its conditions (antecedent, consequent, locals) and the signals it reads. */
function propertyRows(debug: TraceDebug, rows: Row[], add: (path: string) => void) {
  const conditions = [
    ...debug.conditions,
    ...debug.locals.map((local) => ({ text: local.name, role: 'local', values: local.values })),
  ];
  if (conditions.length === 0 && debug.signal_paths.length === 0) return;
  rows.push({ key: 'g:property', kind: 'group', label: 'Property' });
  conditions.forEach((c, i) =>
    rows.push({ key: `c:${i}`, kind: 'cond', label: c.text, role: c.role, values: c.values }),
  );
  debug.signal_paths.forEach(add);
}

const isClock = (name: string) => /clk|clock/i.test(name);

/** The top module's own signals (not the checker's), clocks first. */
function topSignals(cycles: Cycles, top: string): Signal[] {
  const prefix = top === '' ? '' : `${top}.`;
  return cycles.signals
    .filter(
      (s) =>
        !isInternal(s.fullName) &&
        s.fullName.startsWith(prefix) &&
        !s.fullName.slice(prefix.length).includes('.'),
    )
    .sort(
      (a, b) =>
        Number(!isClock(a.name)) - Number(!isClock(b.name)) || a.fullName.localeCompare(b.fullName),
    );
}

/** The trace as a VCD file (GTKWave, Surfer): every signal, in one module scope by its path. */
export function traceToVcd(trace: Trace, title: string): string {
  const ids = new Map(trace.signals.map((signal, i) => [signal.fullName, vcdId(i)]));
  const header = [
    `$comment ${title} (Praman, SiliconBox) $end`,
    `$timescale ${trace.timescale} $end`,
    '$scope module trace $end',
    ...trace.signals.map(
      (s) =>
        `$var wire ${s.width} ${ids.get(s.fullName) ?? '!'} ${s.fullName.replace(/\./g, '_')} $end`,
    ),
    '$upscope $end',
    '$enddefinitions $end',
  ];
  const changes = trace.signals
    .flatMap((s) =>
      s.transitions.map((t) => ({
        time: t.time,
        line: vcdValue(s.width, t.value, ids.get(s.fullName) ?? '!'),
      })),
    )
    .sort((a, b) => a.time - b.time);
  const body: string[] = [];
  let last: number | null = null;
  for (const change of changes) {
    if (change.time !== last) body.push(`#${change.time}`);
    last = change.time;
    body.push(change.line);
  }
  return `${[...header, ...body].join('\n')}\n`;
}

/** A short VCD identifier from printable characters. */
function vcdId(index: number): string {
  let id = '';
  let n = index;
  do {
    id += String.fromCharCode(33 + (n % 94));
    n = Math.floor(n / 94);
  } while (n > 0);
  return id;
}

const vcdValue = (width: number, value: string, id: string) =>
  width === 1 ? `${value.slice(-1)}${id}` : `b${value} ${id}`;

/** A signal an expression names: by its path from the top, or by its full path. */
function resolve(cycles: Cycles, top: string, name: string): Signal {
  const signal = cycles.byPath.get(`${top}.${name}`) ?? cycles.byPath.get(name);
  if (signal === undefined) throw new ExprError(`there is no signal ${name} in this trace`);
  return signal;
}

function reader(cycles: Cycles, top: string): Read {
  return (name, cycle) => {
    const signal = resolve(cycles, top, name);
    return { value: fromBits(valueAt(signal, cycleTime(cycles, cycle))), width: signal.width };
  };
}

/** An expression's value in each cycle, as bits (x when unknown); an ExprError says why not. */
export function expressionValues(cycles: Cycles, top: string, text: string) {
  const tree = parse(text);
  const read = reader(cycles, top);
  const values = cycles.starts.map((_, cycle) => evaluate(tree, cycle, read));
  return { width: Math.max(1, ...values.map((v) => v.width)), bits: values.map(toBits) };
}

/** The next cycle from `from` (or the one before, `step` -1) where the expression holds. */
export function findCycle(
  cycles: Cycles,
  top: string,
  text: string,
  { from, step }: { from: number; step: 1 | -1 },
) {
  const tree = parse(text);
  const read = reader(cycles, top);
  for (let c = from + step; c >= 0 && c < cycles.count; c += step) {
    const { value } = evaluate(tree, c, read);
    if (value !== null && value !== 0n) return c;
  }
  return null;
}

/** A reset as a run keeps it ("!rst_n" when active low, "rst", or nothing). */
export function resetOf(text: string): Reset | null {
  const reset = text.trim();
  if (reset === '' || reset.startsWith('-')) return null;
  return reset.startsWith('!')
    ? { signal: reset.slice(1), active_low: true }
    : { signal: reset, active_low: false };
}
