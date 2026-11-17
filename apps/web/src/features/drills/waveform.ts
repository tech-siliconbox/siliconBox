import type { Trace } from '@siliconbox/shared';

// Turns a solver trace (value changes per signal) into what the waveform view draws: one row
// per signal, one column per time point, with runs of equal values merged.

export type Segment = { from: number; to: number; value: string };
export type WaveRow = { name: string; width: number; segments: Segment[] };

/** A bus value as the learner reads it: hex for clean binary, the raw value when x or z. */
export function busLabel(value: string): string {
  if (!/^[01]+$/.test(value)) return value.toLowerCase();
  return BigInt(`0b${value}`).toString(16).toUpperCase();
}

/** The signal's value at each time point, carrying the last change forward. */
function valuesAt(timepoints: number[], changes: Trace['signals'][number]['transitions']) {
  let index = -1;
  let value = 'x';
  return timepoints.map((time) => {
    while ((changes[index + 1]?.time ?? Infinity) <= time) {
      index += 1;
      value = changes[index]?.value ?? value;
    }
    return value;
  });
}

function mergeRuns(values: string[]): Segment[] {
  const segments: Segment[] = [];
  values.forEach((value, column) => {
    const last = segments.at(-1);
    if (last?.value === value) last.to = column + 1;
    else segments.push({ from: column, to: column + 1, value });
  });
  return segments;
}

/**
 * Bookkeeping the formal tool adds to traces: step counters, helper registers and the nets
 * Yosys names after the processes it lowers (`anyseq_auto_setundef_cc_550_execute_121`).
 */
const isToolInternal = (name: string) =>
  name.startsWith('smt_') || name.startsWith('_') || /(^|_)c+_\d+_execute_\d+$/.test(name);

/**
 * One row per signal the learner wrote or the design declares. The same signal seen at several
 * levels of the hierarchy (testbench, design, properties) is shown once.
 */
export function waveRows(trace: Trace): WaveRow[] {
  const rows = new Map<string, WaveRow>();
  for (const signal of trace.signals) {
    if (isToolInternal(signal.name) || rows.has(signal.name)) continue;
    rows.set(signal.name, {
      name: signal.name,
      width: signal.width,
      segments: mergeRuns(valuesAt(trace.timepoints, signal.transitions)),
    });
  }
  return [...rows.values()];
}
