import { describe, expect, it } from 'vitest';
import { tclCommand, tclWord } from './tcl';

describe('tclWord', () => {
  it('keeps plain words as they are', () => {
    expect(tclWord('fifo_sva.sv')).toBe('fifo_sva.sv');
    expect(tclWord('!rst_n')).toBe('!rst_n');
  });

  it('braces words with spaces or Tcl characters', () => {
    expect(tclWord('my design.sv')).toBe('{my design.sv}');
    expect(tclWord('a[1]')).toBe('{a[1]}');
    expect(tclWord('$x')).toBe('{$x}');
  });
});

describe('tclCommand', () => {
  it('builds a command line', () => {
    expect(tclCommand('analyze', '-sv', 'fifo.sv', 'my sva.sv')).toBe(
      'analyze -sv fifo.sv {my sva.sv}',
    );
  });
});
