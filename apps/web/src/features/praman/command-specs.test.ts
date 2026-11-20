import { PRAMAN_CEILINGS } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { commandSpecs } from './command-specs';
import { PramanSnapshotSchema } from './praman-snapshot';

/** An elaborated session's state, as Praman sends it, with the given reset. */
const snapshotWith = (reset: { signal: string; active_low: boolean }) =>
  PramanSnapshotSchema.parse({
    label: 'Session 1',
    phase: 'elaborated',
    busy: false,
    top: 'fifo',
    clock: 'clk',
    reset,
    tree: null,
    files: [],
    properties: [],
    settings: { time_limit: 300, per_property_time_limit: 300, max_trace_length: 20 },
    proof: { running: false, started_at: null, total: 0, time_limit: 300 },
  });

const specs = commandSpecs(null, PRAMAN_CEILINGS.basic);

describe('commandSpecs', () => {
  it('builds the Tcl line a learner would type', () => {
    expect(specs.elaborate.build({ top: 'fifo' })).toBe('elaborate -top fifo');
    expect(specs.setup.build({ clock: 'clk', reset: '!rst_n' })).toBe('clock clk; reset !rst_n');
    expect(specs.setup.build({ clock: 'clk', reset: '' })).toBe('clock clk; reset -none');
    expect(specs.limits.build({ minutes: '3', cycles: '40' })).toBe(
      'set_prove_time_limit 3m; set_max_trace_length 40',
    );
  });

  it('suggests !rst_n until a reset is declared, and shows a declared one', () => {
    expect(specs.setup.fields[1]?.defaultValue).toBe('!rst_n');
    const declared = (reset: { signal: string; active_low: boolean }) =>
      commandSpecs(snapshotWith(reset), PRAMAN_CEILINGS.basic).setup.fields[1]?.defaultValue;
    expect(declared({ signal: 'rst', active_low: false })).toBe('rst');
    expect(declared({ signal: '', active_low: false })).toBe('');
  });

  it("caps the limits at the learner's ceilings", () => {
    const [time, cycles] = specs.limits.fields;
    expect(time?.max).toBe(5);
    expect(cycles?.max).toBe(50);
  });
});
