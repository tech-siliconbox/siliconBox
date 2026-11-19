import { describe, expect, it } from 'vitest';
import { readPramanTrace } from './praman-trace';

// An invented two-signal trace in the shape Praman's session hands over.
const PAYLOAD = {
  job_id: 's_r1',
  assertion: 'ap_bad',
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
      property: 'ap_bad',
      explanation: 'ap_bad fails at cycle 2: q is 5.',
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

  it('answers null for anything else', () => {
    expect(readPramanTrace({ error: 'VCD file not found' })).toBeNull();
    expect(readPramanTrace(null)).toBeNull();
  });
});
