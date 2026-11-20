import { describe, expect, it } from 'vitest';
import { ExprError, type Value, evaluate, fromBits, parse, signalsOf, toBits } from './trace-expr';

// An invented trace: a 3-bit counter that counts 0..5, an enable that rises at cycle 2.
const TRACE: Readonly<Record<string, string[]>> = {
  count: ['000', '000', '001', '010', '011', '101'],
  en: ['0', '0', '1', '1', '1', '0'],
  data: ['xx01', '0011', '0011', '1100', '1100', '1100'],
};

const read = (name: string, cycle: number): Value => {
  const values = TRACE[name];
  if (values === undefined) throw new ExprError(`no signal ${name}`);
  const bits = values[Math.min(cycle, values.length - 1)] ?? 'x';
  return { value: fromBits(bits), width: bits.length };
};

const at = (source: string, cycle: number) => toBits(evaluate(parse(source), cycle, read));

describe('expressions over a trace', () => {
  it('compares and combines values, with Verilog widths', () => {
    expect(at('count == 3', 4)).toBe('1');
    expect(at('count + 1', 5)).toBe('0110');
    expect(at("en && count >= 3'd2", 3)).toBe('1');
    expect(at('count < 2 ? 1 : 0', 2)).toBe('1');
  });

  it('selects bits and parts, and reduces', () => {
    expect(at('count[2]', 5)).toBe('1');
    expect(at('count[1:0]', 5)).toBe('01');
    expect(at('&count', 5)).toBe('0');
    expect(at('^count', 5)).toBe('0');
  });

  it('reads the past with the sampled-value functions', () => {
    expect(at('$rose(en)', 2)).toBe('1');
    expect(at('$rose(en)', 3)).toBe('0');
    expect(at('$fell(en)', 5)).toBe('1');
    expect(at('$past(count, 2)', 5)).toBe('010');
    expect(at('$stable(count)', 1)).toBe('1');
    expect(at('$changed(count)', 2)).toBe('1');
  });

  it('never guesses an unknown value, but keeps the known short cuts', () => {
    expect(at('data == 4', 0)).toBe('x');
    expect(at('en && data == 4', 0)).toBe('0');
    expect(at('$rose(en)', 0)).toBe('x');
  });

  it('names the signals it reads, and says what it cannot read', () => {
    expect([...signalsOf(parse('$rose(en) && count[1:0] == 2'))].sort()).toEqual(['count', 'en']);
    expect(() => parse('count ==')).toThrow(ExprError);
    expect(() => parse('$foo(en)')).toThrow(/not supported/);
    expect(() => parse('count @ 2')).toThrow(/cannot read/);
  });
});
