import type { ToolEvent } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOG_FILTER,
  countOf,
  lineText,
  locationOf,
  propertyOf,
  visibleLines,
} from './log-view';

const event = (seq: number, kind: string, text: string, extra: object = {}): ToolEvent => ({
  seq,
  t: seq,
  kind,
  text,
  ...extra,
});

const LOG = [
  event(1, 'ui', 'menu: prove'),
  event(2, 'cmd', 'prove -all'),
  event(3, 'info', 'Starting proof', { code: 'PMI001' }),
  event(4, 'engine', 'abc pdr: time limit'),
  event(5, 'error', 'a_no_overflow: cex', { code: 'PME002' }),
  event(6, 'cmd', 'analyze -sv fifo.sv', { depth: 1 }),
];

describe('the log view', () => {
  it('prints commands after their prompt and messages after their tag', () => {
    expect(LOG.map(lineText).slice(1)).toEqual([
      '% prove -all',
      'INFO (PMI001): Starting proof',
      'INFO: abc pdr: time limit',
      'ERROR (PME002): a_no_overflow: cex',
      '%% analyze -sv fifo.sv',
    ]);
  });

  it('hides the menu lines and, until asked for, the engine detail', () => {
    const seqs = visibleLines(LOG, DEFAULT_LOG_FILTER, '', 0).lines.map((line) => line.seq);
    expect(seqs).toEqual([2, 3, 5, 6]);
    const all = visibleLines(LOG, { ...DEFAULT_LOG_FILTER, engine: true }, '', 0);
    expect(all.lines.map((line) => line.seq)).toEqual([2, 3, 4, 5, 6]);
  });

  it('searches the printed lines and starts again after a Clear', () => {
    expect(visibleLines(LOG, DEFAULT_LOG_FILTER, ' pme002 ', 0).lines.map((l) => l.seq)).toEqual([
      5,
    ]);
    expect(visibleLines(LOG, DEFAULT_LOG_FILTER, '', 5).lines.map((l) => l.seq)).toEqual([6]);
    expect(countOf(LOG, 'error', 0)).toBe(1);
    expect(countOf(LOG, 'error', 5)).toBe(0);
  });

  it('reads the file and line a message points at, and the property a result is about', () => {
    expect(locationOf(event(7, 'error', 'fifo.sv(12): unknown signal x'))).toEqual({
      name: 'fifo.sv',
      line: 12,
    });
    expect(locationOf(event(8, 'cmd', 'fifo.sv(12): not a message'))).toBeNull();
    expect(locationOf(event(9, 'info', 'Starting proof'))).toBeNull();
    expect(propertyOf(event(10, 'result', 'ap_full: proven', { prop: 'fifo.ap_full' }))).toBe(
      'fifo.ap_full',
    );
    expect(propertyOf(event(11, 'info', 'Starting proof'))).toBeNull();
  });
});
