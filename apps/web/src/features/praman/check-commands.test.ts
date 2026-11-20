import { describe, expect, it } from 'vitest';
import {
  abstractLine,
  caseSplitLine,
  connectivityLine,
  equivalenceLine,
  revisedCandidates,
  taskLine,
} from './check-commands';

const file = (name: string, analyzed: boolean) => ({ name, lines: 1, bytes: 1, analyzed });

describe('the check commands', () => {
  it('offers only design files not analyzed as a revised design', () => {
    const files = [file('fifo.sv', true), file('fifo_v2.sv', false), file('pm.tcl', false)];
    expect(revisedCandidates(files)).toEqual(['fifo_v2.sv']);
  });

  it('checks a revised design, bounded when asked', () => {
    expect(equivalenceLine(['fifo_v2.sv'], false)).toBe('check_equivalence -revised fifo_v2.sv');
    expect(equivalenceLine(['a.sv', 'my b.sv'], true)).toBe(
      'check_equivalence -revised {a.sv {my b.sv}} -bounded',
    );
  });

  it('loads connectivity, makes tasks and abstracts registers', () => {
    expect(connectivityLine('conn.csv')).toBe('check_conn -load conn.csv');
    expect(taskLine('no_bp', ['a_flags', 'c_full'], true, true)).toBe(
      'task -create no_bp -copy {a_flags c_full} -copy_assumes -set',
    );
    expect(taskLine('mine', [], false, false)).toBe('task -create mine');
    expect(abstractLine('counter', 'u.count')).toBe('abstract -counter u.count');
    expect(abstractLine('init_value', 'mem[3]')).toBe('abstract -init_value {mem[3]}');
  });

  it('splits an assertion by an expression or by its own cases', () => {
    expect(caseSplitLine('fifo.u.a_flags', 'values', ' mode ')).toBe(
      'case_split -property fifo.u.a_flags -values mode',
    );
    expect(caseSplitLine('a', 'cases', "mode == 2'd0\n\nmode == 2'd1\n")).toBe(
      "case_split -property a -cases {{mode == 2'd0} {mode == 2'd1}}",
    );
    expect(caseSplitLine('a', 'lowest_bit', '  ')).toBeNull();
  });
});
