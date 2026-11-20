import { describe, expect, it } from 'vitest';
import { PramanSnapshotSchema } from './praman-snapshot';
import { clockText, proofProgress } from './proof-clock';

const snapshot = (proof: object, statuses: string[]) =>
  PramanSnapshotSchema.parse({
    label: 'S',
    phase: 'elaborated',
    busy: false,
    top: 'fifo',
    clock: 'clk',
    reset: null,
    tree: null,
    files: [],
    properties: statuses.map((status, n) => ({
      id: `p${n}`,
      name: `p${n}`,
      type: n === 3 ? 'assume' : 'assert',
      instance: 'u',
      status,
    })),
    settings: { time_limit: 300, per_property_time_limit: 300, max_trace_length: 20 },
    proof: { running: false, started_at: null, total: 0, time_limit: 300, ...proof },
  });

describe('the proof clock', () => {
  it('shows hours, minutes and seconds', () => {
    expect(clockText(8)).toBe('00:00:08');
    expect(clockText(86_400 - 1)).toBe('23:59:59');
  });

  it('counts a running proof against its limit, and the properties decided', () => {
    const progress = proofProgress(
      snapshot({ running: true, started_at: 1_000 }, ['cex', 'running', 'not_run', 'assumed']),
      1_008_000,
    );
    expect(progress).toEqual({ elapsed: 8, limit: 300, running: true, decided: 1, total: 3 });
  });

  it('stops the clock when the proof finishes, and shows nothing before a design', () => {
    expect(
      proofProgress(snapshot({ started_at: 1_000, finished_at: 1_027.6 }, ['proven']), 9e9)
        ?.elapsed,
    ).toBeCloseTo(27.6);
    expect(proofProgress(null, 0)).toBeNull();
  });
});
