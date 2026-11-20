import type { ToolSignalList, Trace } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import {
  cyclesOf,
  defaultRows,
  edgeFrom,
  expressionValues,
  findCycle,
  formatValue,
  moveRow,
  resetCycles,
  savedRows,
  segmentsOf,
  stepRow,
  traceToVcd,
  valueAt,
  withList,
  xOf,
  type Row,
} from './visualize';

// An invented trace of a counter: four cycles of 10 time units, smt_step marking each.
const signal = (fullName: string, width: number, changes: [number, string][]) => ({
  name: fullName.split('.').pop() ?? fullName,
  fullName,
  width,
  transitions: changes.map(([time, value]) => ({ time, value })),
});

const TRACE: Trace = {
  timescale: '1ns',
  endTime: 40,
  timepoints: [0, 5, 10, 15, 20, 25, 30, 35],
  signals: [
    signal('smt_step', 32, [
      [0, '0'],
      [10, '1'],
      [20, '10'],
      [30, '11'],
    ]),
    signal('top.rst_n', 1, [
      [0, '0'],
      [10, '1'],
    ]),
    signal('top.clk', 1, [
      [0, '1'],
      [5, '0'],
      [10, '1'],
      [15, '0'],
      [20, '1'],
      [25, '0'],
      [30, '1'],
      [35, '0'],
    ]),
    signal('top.count', 3, [
      [0, '0'],
      [20, '1'],
      [30, '101'],
    ]),
    signal('top.__va_mon.full', 1, [[0, '0']]),
  ],
};
const CYCLES = cyclesOf(TRACE);
const count = CYCLES.byPath.get('top.count');

describe("Visualize's model of a trace", () => {
  it('reads the cycles from smt_step, and values at a time', () => {
    expect(CYCLES.starts).toEqual([0, 10, 20, 30]);
    expect(CYCLES.period).toBe(10);
    expect(count && valueAt(count, 25)).toBe('1');
    expect(count && valueAt(count, -1)).toBe('x');
    expect(xOf(CYCLES, 25, 40)).toBe(100);
  });

  it('shows a bus in a radix, and unknown bits as they are', () => {
    expect(formatValue('101', 3, 'hex')).toBe('5');
    expect(formatValue('101', 3, 'signed')).toBe('-3');
    expect(formatValue('1', 3, 'bin')).toBe('001');
    expect(formatValue('x1', 8, 'hex')).toBe('xx');
    expect(formatValue('1', 1, 'hex')).toBe('1');
  });

  it('cuts a signal into runs, and finds its edges from the cursor', () => {
    expect(count && segmentsOf(CYCLES, count)).toEqual([
      { from: 0, to: 20, value: '0' },
      { from: 20, to: 30, value: '1' },
      { from: 30, to: 40, value: '101' },
    ]);
    expect(count && edgeFrom(CYCLES, count, 0, 1)).toBe(2);
    expect(count && edgeFrom(CYCLES, count, 3, -1)).toBe(2);
    expect(count && edgeFrom(CYCLES, count, 3, 1)).toBeNull();
  });

  it('hatches the cycles the reset holds', () => {
    expect(resetCycles(CYCLES, 'top', { signal: 'rst_n', active_low: true })).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("shows the property's rows, then the top's signals with the clock first", () => {
    const debug = {
      cycles: [0, 1, 2, 3],
      event_cycle: 3,
      trigger_cycle: 2,
      antecedent: null,
      conditions: [{ text: 'count < 5', role: 'consequent', values: [1, 1, 1, 0] }],
      locals: [],
      signals: [],
      signal_paths: ['top.count'],
      explanation: [],
    };
    const rows = defaultRows(CYCLES, debug, 'top');
    expect(
      rows.map((row) =>
        row.kind === 'signal' ? row.path : row.kind === 'group' ? row.label : row.kind,
      ),
    ).toEqual(['Property', 'cond', 'top.count', 'Top: top', 'top.clk', 'top.rst_n']);
  });

  it('exports the trace as a VCD file', () => {
    const vcd = traceToVcd(TRACE, 'a_count_in_range');
    expect(vcd).toContain('$var wire 3');
    expect(vcd).toContain('#20');
    expect(vcd).toContain('b101');
  });

  it('evaluates expression rows, and finds the cycles where one holds', () => {
    expect(expressionValues(CYCLES, 'top', 'count == 1')).toEqual({
      width: 1,
      bits: ['0', '0', '1', '0'],
    });
    expect(findCycle(CYCLES, 'top', '$rose(rst_n)', { from: 0, step: 1 })).toBe(1);
    expect(findCycle(CYCLES, 'top', 'count == 7', { from: 0, step: 1 })).toBeNull();
    expect(() => expressionValues(CYCLES, 'top', 'nothing == 1')).toThrow(/no signal nothing/);
  });
});

describe("Visualize's rows", () => {
  const ROWS = [
    { key: 'g:property', kind: 'group', label: 'Property' },
    { key: 'c:0', kind: 'cond', label: 'count < 5', role: 'consequent', values: [1, 1, 0, 1] },
    { key: 's:top.count', kind: 'signal', path: 'top.count' },
    { key: 's:top.clk', kind: 'signal', path: 'top.clk' },
    { key: 'x:count == 3', kind: 'expr', text: 'count == 3' },
  ] as const satisfies Row[];
  const keys = (rows: readonly Row[]) => rows.map((row) => row.key);

  it('moves a row before the one it is dropped on going up, after it going down', () => {
    expect(keys(moveRow(ROWS, 'x:count == 3', 's:top.count')).slice(2)).toEqual([
      'x:count == 3',
      's:top.count',
      's:top.clk',
    ]);
    expect(keys(moveRow(ROWS, 's:top.count', 'x:count == 3')).slice(2)).toEqual([
      's:top.clk',
      'x:count == 3',
      's:top.count',
    ]);
    expect(keys(stepRow(ROWS, 's:top.clk', -1)).slice(2, 4)).toEqual(['s:top.clk', 's:top.count']);
    expect(keys(stepRow(ROWS, 'x:count == 3', 1))).toEqual(keys(ROWS));
  });

  it("keeps a view's signals and expressions in a list, and shows a list with the property", () => {
    const rows = savedRows(ROWS);
    expect(rows).toEqual([
      { kind: 'signal', path: 'top.count' },
      { kind: 'signal', path: 'top.clk' },
      { kind: 'expr', text: 'count == 3' },
    ]);
    const list: ToolSignalList = {
      name: 'mine',
      top: 'top',
      rows: [...rows, { kind: 'signal', path: 'top.gone' }],
    };
    expect(keys(withList(ROWS, CYCLES, list))).toEqual([
      'g:property',
      'c:0',
      'g:list',
      's:top.count',
      's:top.clk',
      'x:count == 3',
    ]);
  });
});
