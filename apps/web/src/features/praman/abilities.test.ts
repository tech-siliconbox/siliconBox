import { describe, expect, it } from 'vitest';
import { abilitiesOf } from './abilities';
import type { SessionState } from './hooks/use-praman-session';
import { type PramanSnapshot, PramanSnapshotSchema } from './praman-snapshot';

const snapshot = (phase: PramanSnapshot['phase'], files: string[]) =>
  PramanSnapshotSchema.parse({
    label: 'Session 1',
    phase,
    busy: false,
    top: phase === 'elaborated' ? 'fifo' : '',
    clock: null,
    reset: null,
    tree: null,
    files: files.map((name) => ({ name, lines: 1, bytes: 1, analyzed: phase !== 'empty' })),
    properties: [],
    settings: { time_limit: 300, per_property_time_limit: 300, max_trace_length: 20 },
    proof: { running: false, started_at: null, total: 0, time_limit: 300 },
  });

const state = (place: SessionState['place'], snap: PramanSnapshot | null, busy = false) => ({
  place,
  position: null,
  events: [],
  snapshot: snap,
  busy,
  proofRunning: false,
  secondsLeft: 3600,
  error: null,
});

describe('abilitiesOf', () => {
  it('allows nothing but starting or choosing a session without one', () => {
    expect(abilitiesOf(null)).toMatchObject({ session: false, open: false, analyze: null });
  });

  it('analyzes every design and property file of an open session, not its script', () => {
    const can = abilitiesOf(state('open', snapshot('empty', ['fifo.sv', 'fifo_sva.sv', 'pm.tcl'])));
    expect(can.analyze).toBe('analyze -sv fifo.sv fifo_sva.sv');
    expect(can.script).toBe(true);
    expect(can.elaborate).toBe(false);
  });

  it('proves only an elaborated design, and nothing while a command runs', () => {
    expect(abilitiesOf(state('open', snapshot('elaborated', ['fifo.sv']))).elaborated).toBe(true);
    expect(abilitiesOf(state('open', snapshot('elaborated', ['fifo.sv']), true)).elaborated).toBe(
      false,
    );
    expect(abilitiesOf(state('waiting', snapshot('elaborated', ['fifo.sv']))).elaborated).toBe(
      false,
    );
  });
});
