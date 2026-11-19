import type { Trace } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { busLabel, waveRows } from './waveform';

const trace: Trace = {
  timescale: '1ns',
  endTime: 30,
  timepoints: [0, 10, 20, 30],
  signals: [
    {
      name: 'en',
      fullName: 'top.en',
      width: 1,
      transitions: [
        { time: 0, value: '0' },
        { time: 10, value: '1' },
      ],
    },
    {
      name: 'count',
      fullName: 'top.count',
      width: 4,
      transitions: [
        { time: 0, value: '1001' },
        { time: 30, value: '1010' },
      ],
    },
    { name: 'late', fullName: 'top.late', width: 1, transitions: [{ time: 20, value: '1' }] },
    { name: 'en', fullName: 'top.dut.en', width: 1, transitions: [{ time: 0, value: '0' }] },
    { name: 'smt_step', fullName: 'top.smt_step', width: 8, transitions: [] },
    { name: '_va_past_valid', fullName: 'top._va_past_valid', width: 1, transitions: [] },
    { name: 'c_550_execute_121', fullName: 'top.c_550_execute_121', width: 8, transitions: [] },
    {
      name: 'anyseq_auto_setundef_cc_550_execute_123',
      fullName: 'top.anyseq_auto_setundef_cc_550_execute_123',
      width: 8,
      transitions: [],
    },
  ],
};

describe('waveRows', () => {
  it('merges equal values, shows each signal once and hides tool bookkeeping', () => {
    expect(waveRows(trace)).toEqual([
      {
        name: 'en',
        width: 1,
        segments: [
          { from: 0, to: 1, value: '0' },
          { from: 1, to: 4, value: '1' },
        ],
      },
      {
        name: 'count',
        width: 4,
        segments: [
          { from: 0, to: 3, value: '1001' },
          { from: 3, to: 4, value: '1010' },
        ],
      },
      {
        name: 'late',
        width: 1,
        segments: [
          { from: 0, to: 2, value: 'x' },
          { from: 2, to: 4, value: '1' },
        ],
      },
    ]);
  });
});

describe('busLabel', () => {
  it.each([
    ['1001', '9'],
    ['11111111', 'FF'],
    ['10x1', '10x1'],
  ])('%s reads as %s', (value, label) => {
    expect(busLabel(value)).toBe(label);
  });
});
