import { describe, expect, it } from 'vitest';
import { completion } from './complete';

const PROPERTIES = ['fifo.u.a_no_overflow', 'fifo.u.a_flags'];

describe('completion', () => {
  it('finishes a command name with a space', () => {
    expect(completion('elab', PROPERTIES)).toBe('orate ');
  });

  it('fills in as far as several commands agree', () => {
    expect(completion('check_a', PROPERTIES)).toBe('ssumptions ');
    expect(completion('set_prove', PROPERTIES)).toBe('_');
  });

  it('completes property names after the command', () => {
    expect(completion('prove -property fifo.u.a_n', PROPERTIES)).toBe('o_overflow ');
    expect(completion('prove -property fifo.u.a_', PROPERTIES)).toBe('');
  });

  it('adds nothing without a word or a match', () => {
    expect(completion('', PROPERTIES)).toBe('');
    expect(completion('nothing', PROPERTIES)).toBe('');
  });
});
