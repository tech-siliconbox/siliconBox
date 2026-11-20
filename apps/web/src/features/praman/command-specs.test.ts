import { PRAMAN_CEILINGS } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { clockResetDefaults, clockResetLine, commandSpecs } from './command-specs';
import { PramanSnapshotSchema } from './praman-snapshot';

/** An elaborated session's state, as Praman sends it, with the given clock and reset. */
const snapshotWith = (
  clock: string | null,
  reset: { signal: string; active_low: boolean } | null,
  detected: object = {},
) =>
  PramanSnapshotSchema.parse({
    label: 'Session 1',
    phase: 'elaborated',
    busy: false,
    top: 'fifo',
    clock,
    reset,
    ports: [
      { name: 'clk', direction: 'input', width: 1 },
      { name: 'rst_n', direction: 'input', width: 1 },
      { name: 'data', direction: 'input', width: 8 },
    ],
    detected,
    tree: null,
    files: [],
    properties: [],
    settings: { time_limit: 300, per_property_time_limit: 300, max_trace_length: 20 },
    proof: { running: false, started_at: null, total: 0, time_limit: 300 },
  });

const specs = commandSpecs(null, PRAMAN_CEILINGS.basic);

describe('commandSpecs', () => {
  it('builds the Tcl line a learner would type', () => {
    expect(specs.elaborate.build({ top: 'fifo', witness: 'on' })).toBe('elaborate -top fifo');
    expect(specs.elaborate.build({ top: 'fifo', witness: '' })).toBe(
      'elaborate -top fifo -create_related_covers precondition',
    );
    expect(specs.limits.build({ minutes: '3', each: '2', cycles: '40' })).toBe(
      'set_prove_time_limit 3m; set_prove_per_property_time_limit 2m; set_max_trace_length 40',
    );
  });

  it('builds the clock and reset lines, or -none for either', () => {
    expect(clockResetLine({ clock: 'clk', reset: 'rst_n', low: true })).toBe(
      'clock clk; reset !rst_n',
    );
    expect(clockResetLine({ clock: 'clk', reset: 'rst', low: false })).toBe('clock clk; reset rst');
    expect(clockResetLine({ clock: '', reset: '', low: true })).toBe('clock -none; reset -none');
  });

  it('suggests what Praman found until a clock and reset are declared', () => {
    const found = { signal: 'rst_n', active_low: true, clocks: ['clk'] };
    expect(clockResetDefaults(snapshotWith(null, null, found))).toEqual({
      clock: 'clk',
      reset: 'rst_n',
      low: true,
    });
    expect(clockResetDefaults(snapshotWith('clk', { signal: 'rst', active_low: false }))).toEqual({
      clock: 'clk',
      reset: 'rst',
      low: false,
    });
    expect(clockResetDefaults(snapshotWith('', { signal: '', active_low: false }))).toEqual({
      clock: '',
      reset: '',
      low: false,
    });
  });

  it("caps the limits at the learner's ceilings", () => {
    const [time, each, cycles] = specs.limits.fields;
    expect(time?.max).toBe(5);
    expect(each?.max).toBe(5);
    expect(cycles?.max).toBe(50);
  });
});
