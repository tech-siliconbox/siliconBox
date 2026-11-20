import { describe, expect, it } from 'vitest';
import { readPramanTrace } from './praman-trace';

// An invented two-signal trace in the shape Praman's session hands over.
const PAYLOAD = {
  job_id: 's_r1',
  assertion: { name: 'ap_bad', status: 'FAIL', type: 'ASSERT', step: 2 },
  vcd_data: {
    path: 'run/trace.vcd',
    timescale: '1ns',
    end_time: 30,
    timepoints: [0, 10, 20, 30],
    signal_details: [
      {
        name: 'q',
        full_name: 'pair.q',
        scope: 'pair',
        width: 3,
        type: 'reg',
        transitions: [
          { time: 0, value: '000' },
          { time: 20, value: '101' },
        ],
      },
    ],
  },
  llm_summary: 'ap_bad fails at cycle 2: q is 5.',
};

describe('readPramanTrace', () => {
  it("reads Praman's waveform data into SiliconBox's trace", () => {
    expect(readPramanTrace(PAYLOAD)).toEqual({
      explanation: 'ap_bad fails at cycle 2: q is 5.',
      debug: null,
      kind: 'ASSERT',
      property: 'ap_bad',
      jobId: 's_r1',
      failCycle: 2,
      trace: {
        timescale: '1ns',
        endTime: 30,
        timepoints: [0, 10, 20, 30],
        signals: [
          {
            name: 'q',
            fullName: 'pair.q',
            width: 3,
            transitions: [
              { time: 0, value: '000' },
              { time: 20, value: '101' },
            ],
          },
        ],
      },
    });
  });

  it("reads the property's own account, cycle by cycle, and the kind of trace", () => {
    const debug = {
      cycles: [0, 1, 2],
      event_cycle: 2,
      trigger_cycle: 1,
      antecedent: { text: 'start', start: 1, end: 1 },
      conditions: [{ text: 'q < 5', role: 'consequent', values: [1, 1, 0] }],
      signals: [{ name: 'q', path: 'pair.q', width: 3, values: ['0', '0', '5'] }],
      explanation: ['`ap_bad` fails at cycle 2.'],
    };
    const read = readPramanTrace({ ...PAYLOAD, debug, assertion: { name: 'c_q', type: 'COVER' } });
    expect(read?.kind).toBe('COVER');
    expect(read?.failCycle).toBe(2);
    expect(read?.debug?.conditions[0]?.values).toEqual([1, 1, 0]);
    expect(read?.debug?.signal_paths).toEqual([]);
  });

  it('keeps the trace when its account does not read', () => {
    expect(readPramanTrace({ ...PAYLOAD, debug: { cycles: 'many' } })?.debug).toBeNull();
  });

  it('answers null for anything else', () => {
    expect(readPramanTrace({ error: 'VCD file not found' })).toBeNull();
    expect(readPramanTrace(null)).toBeNull();
  });
});
