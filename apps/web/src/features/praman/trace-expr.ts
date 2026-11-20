// Expressions over a trace (Visualize: expression rows and Find), evaluated cycle by cycle in the
// browser. Verilog operators and literals, bit and part selects, ?:, and the SVA sampled-value
// functions $past, $rose, $fell, $stable and $changed. Values are exact (BigInt); a value with x or
// z in it is unknown, and so is anything computed from it (never guessed). Ported from Praman.

type Kind = 'bool' | 'cmp' | 'shift' | 'arith';
type BinaryOp = keyof typeof BINARY;

const BINARY = {
  '||': [1, 'bool', (a: boolean, b: boolean) => (a || b ? 1n : 0n)],
  '&&': [2, 'bool', (a: boolean, b: boolean) => (a && b ? 1n : 0n)],
  '|': [3, 'arith', (a: bigint, b: bigint) => a | b],
  '^': [4, 'arith', (a: bigint, b: bigint) => a ^ b],
  '&': [5, 'arith', (a: bigint, b: bigint) => a & b],
  '==': [6, 'cmp', (a: bigint, b: bigint) => (a === b ? 1n : 0n)],
  '!=': [6, 'cmp', (a: bigint, b: bigint) => (a !== b ? 1n : 0n)],
  '===': [6, 'cmp', (a: bigint, b: bigint) => (a === b ? 1n : 0n)],
  '!==': [6, 'cmp', (a: bigint, b: bigint) => (a !== b ? 1n : 0n)],
  '<': [7, 'cmp', (a: bigint, b: bigint) => (a < b ? 1n : 0n)],
  '<=': [7, 'cmp', (a: bigint, b: bigint) => (a <= b ? 1n : 0n)],
  '>': [7, 'cmp', (a: bigint, b: bigint) => (a > b ? 1n : 0n)],
  '>=': [7, 'cmp', (a: bigint, b: bigint) => (a >= b ? 1n : 0n)],
  '<<': [8, 'shift', (a: bigint, b: bigint) => a << b],
  '>>': [8, 'shift', (a: bigint, b: bigint) => a >> b],
  '+': [9, 'arith', (a: bigint, b: bigint) => a + b],
  '-': [9, 'arith', (a: bigint, b: bigint) => a - b],
  '*': [10, 'arith', (a: bigint, b: bigint) => a * b],
  '/': [10, 'arith', (a: bigint, b: bigint) => (b === 0n ? null : a / b)],
  '%': [10, 'arith', (a: bigint, b: bigint) => (b === 0n ? null : a % b)],
} as const;

const FUNCTIONS = ['$past', '$rose', '$fell', '$stable', '$changed'] as const;
type SvaFunction = (typeof FUNCTIONS)[number];
const UNARY = ['!', '~', '-', '+', '&', '|', '^'] as const;

export class ExprError extends Error {}

export type Node =
  | { type: 'num'; value: bigint | null; width: number }
  | { type: 'sig'; name: string }
  | { type: 'select'; of: Node; hi: Node; lo: Node | null }
  | { type: 'unary'; op: (typeof UNARY)[number]; arg: Node }
  | { type: 'bin'; op: BinaryOp; left: Node; right: Node }
  | { type: 'cond'; cond: Node; yes: Node; no: Node }
  | { type: 'fn'; name: SvaFunction; args: Node[] };

/** A value in a cycle: exact, or null when unknown; and its width in bits. */
export type Value = { value: bigint | null; width: number };
/** Reads a signal's value in a cycle. */
export type Read = (name: string, cycle: number) => Value;

type Token =
  | { kind: 'num'; value: bigint | null; width: number }
  | { kind: 'fn' | 'id' | 'op'; value: string };

const TOKEN =
  /\s*(?:(\d+)?'([sS]?[bodhBODH])([0-9a-fA-F_xXzZ?]+)|(\d[\d_]*)|(\$?[A-Za-z_][\w$]*(?:\.[A-Za-z_][\w$]*)*)|(===|!==|==|!=|<=|>=|&&|\|\||<<|>>|[-+*/%<>!~&|^?:()[\],]))/y;

const RADIX: Readonly<Record<string, string>> = { b: '0b', o: '0o', h: '0x' };

/** A sized literal (8'h3f, 'b1x0): its value, or null with x, z or ? digits. */
function literal(size: string | undefined, base: string, raw: string): Token {
  const digits = raw.replace(/_/g, '');
  const width = size === undefined ? 32 : Number(size);
  if (/[xXzZ?]/.test(digits)) return { kind: 'num', value: null, width };
  const prefix = RADIX[base.slice(-1).toLowerCase()];
  return {
    kind: 'num',
    value: BigInt(prefix === undefined ? digits : `${prefix}${digits}`),
    width,
  };
}

function tokenOf(m: RegExpExecArray): Token {
  const [, size, base, digits, number, name, op] = m;
  if (digits !== undefined && base !== undefined) return literal(size, base, digits);
  if (number !== undefined) {
    // An unsized number takes the bits it needs (qa + 1 stays as wide as qa, plus the carry).
    const value = BigInt(number.replace(/_/g, ''));
    return { kind: 'num', value, width: Math.max(1, value.toString(2).length) };
  }
  if (name !== undefined) return { kind: name.startsWith('$') ? 'fn' : 'id', value: name };
  return { kind: 'op', value: op ?? '' };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  while (at < source.length && !/^\s*$/.test(source.slice(at))) {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(source);
    if (m === null) throw new ExprError(`cannot read "${source.slice(at).trim().slice(0, 12)}"`);
    at = TOKEN.lastIndex;
    tokens.push(tokenOf(m));
  }
  return tokens;
}

/** Precedence climbing over the tokens. */
class Parser {
  private at = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(): Token | undefined {
    return this.tokens[this.at];
  }

  take(value?: string): Token {
    const token = this.tokens[this.at];
    if (token === undefined || (value !== undefined && token.value !== value)) {
      throw new ExprError(
        value === undefined ? 'the expression ends too early' : `expected "${value}"`,
      );
    }
    this.at += 1;
    return token;
  }

  done(): boolean {
    return this.at >= this.tokens.length;
  }

  expression(): Node {
    const cond = this.binary(1);
    if (this.peek()?.value !== '?') return cond;
    this.take('?');
    const yes = this.expression();
    this.take(':');
    return { type: 'cond', cond, yes, no: this.expression() };
  }

  private binary(least: number): Node {
    let left = this.primary();
    for (;;) {
      const token = this.peek();
      const op = token?.kind === 'op' && token.value in BINARY ? (token.value as BinaryOp) : null;
      if (op === null || BINARY[op][0] < least) return left;
      this.take();
      left = { type: 'bin', op, left, right: this.binary(BINARY[op][0] + 1) };
    }
  }

  private primary(): Node {
    const token = this.take();
    if (token.kind === 'num') return { type: 'num', value: token.value, width: token.width };
    if (token.kind === 'fn') return this.call(token.value);
    if (token.kind === 'id') return this.selects({ type: 'sig', name: token.value });
    if (token.value === '(') {
      const inner = this.expression();
      this.take(')');
      return inner;
    }
    const op = UNARY.find((each) => each === token.value);
    if (op !== undefined) return { type: 'unary', op, arg: this.primary() };
    throw new ExprError(`unexpected "${token.value}"`);
  }

  private call(name: string): Node {
    const fn = FUNCTIONS.find((each) => each === name);
    if (fn === undefined)
      throw new ExprError(`${name} is not supported (use ${FUNCTIONS.join(', ')})`);
    this.take('(');
    const args = [this.expression()];
    while (this.peek()?.value === ',') {
      this.take(',');
      args.push(this.expression());
    }
    this.take(')');
    return { type: 'fn', name: fn, args };
  }

  private selects(of: Node): Node {
    let node = of;
    while (this.peek()?.value === '[') {
      this.take('[');
      const hi = this.expression();
      let lo: Node | null = null;
      if (this.peek()?.value === ':') {
        this.take(':');
        lo = this.expression();
      }
      this.take(']');
      node = { type: 'select', of: node, hi, lo };
    }
    return node;
  }
}

/** The expression's tree; an ExprError says what cannot be read. */
export function parse(source: string): Node {
  const parser = new Parser(tokenize(source));
  const tree = parser.expression();
  const rest = parser.peek();
  if (!parser.done() && rest !== undefined)
    throw new ExprError(`unexpected "${String(rest.value)}"`);
  return tree;
}

/** The names of the signals an expression reads (to find them in the trace). */
export function signalsOf(tree: Node, out = new Set<string>()): Set<string> {
  if (tree.type === 'sig') out.add(tree.name);
  const children: (Node | null)[] =
    tree.type === 'select'
      ? [tree.of, tree.hi, tree.lo]
      : tree.type === 'unary'
        ? [tree.arg]
        : tree.type === 'bin'
          ? [tree.left, tree.right]
          : tree.type === 'cond'
            ? [tree.cond, tree.yes, tree.no]
            : tree.type === 'fn'
              ? tree.args
              : [];
  for (const child of children) if (child !== null) signalsOf(child, out);
  return out;
}

const mask = (width: number) => (1n << BigInt(width)) - 1n;
const fit = (value: bigint | null, width: number) => (value === null ? null : value & mask(width));

type Eval = (node: Node, cycle: number) => Value;

function select(node: Extract<Node, { type: 'select' }>, cycle: number, ev: Eval): Value {
  const of = ev(node.of, cycle);
  const hi = ev(node.hi, cycle).value;
  const lo = node.lo === null ? hi : ev(node.lo, cycle).value;
  if (hi === null || lo === null) return { value: null, width: 1 };
  const width = Number(hi - lo) + 1;
  if (width < 1) throw new ExprError('a part select must be [high:low]');
  return { value: of.value === null ? null : fit(of.value >> lo, width), width };
}

function parity(value: bigint): bigint {
  let ones = 0n;
  for (let v = value; v > 0n; v >>= 1n) ones += v & 1n;
  return ones & 1n;
}

function unary(node: Extract<Node, { type: 'unary' }>, cycle: number, ev: Eval): Value {
  const a = ev(node.arg, cycle);
  const reduces = node.op === '!' || node.op === '&' || node.op === '|' || node.op === '^';
  if (a.value === null) return { value: null, width: reduces ? 1 : a.width };
  const results: Record<typeof node.op, Value> = {
    '!': { value: a.value === 0n ? 1n : 0n, width: 1 },
    '~': { value: fit(~a.value, a.width), width: a.width },
    '-': { value: fit(-a.value, a.width), width: a.width },
    '+': a,
    '&': { value: a.value === mask(a.width) ? 1n : 0n, width: 1 },
    '|': { value: a.value !== 0n ? 1n : 0n, width: 1 },
    '^': { value: parity(a.value), width: 1 },
  };
  return results[node.op];
}

function widthOf(op: BinaryOp, kind: Kind, a: Value, b: Value): number {
  if (kind === 'bool' || kind === 'cmp') return 1;
  if (kind === 'shift') return a.width;
  if (op === '*') return Math.min(a.width + b.width, 4096);
  return Math.max(a.width, b.width) + (op === '+' ? 1 : 0);
}

/** && and ||, with their known short cuts: 0 && x is 0, 1 || x is 1. */
function logical(op: '&&' | '||', a: Value, b: Value): Value {
  const known = (v: Value) => v.value !== null;
  const truthy = (v: Value) => v.value !== null && v.value !== 0n;
  if (op === '&&' && (a.value === 0n || b.value === 0n)) return { value: 0n, width: 1 };
  if (op === '||' && (truthy(a) || truthy(b))) return { value: 1n, width: 1 };
  if (!known(a) || !known(b)) return { value: null, width: 1 };
  return { value: BINARY[op][2](truthy(a), truthy(b)), width: 1 };
}

function binary(node: Extract<Node, { type: 'bin' }>, cycle: number, ev: Eval): Value {
  const a = ev(node.left, cycle);
  const b = ev(node.right, cycle);
  const { op } = node;
  if (op === '&&' || op === '||') return logical(op, a, b);
  const kind: Kind = BINARY[op][1];
  const width = widthOf(op, kind, a, b);
  if (a.value === null || b.value === null) return { value: null, width };
  const out = BINARY[op][2](a.value, b.value);
  return { value: fit(out, width), width };
}

function conditional(node: Extract<Node, { type: 'cond' }>, cycle: number, ev: Eval): Value {
  const k = ev(node.cond, cycle);
  const yes = ev(node.yes, cycle);
  const no = ev(node.no, cycle);
  const width = Math.max(yes.width, no.width);
  if (k.value === null)
    return { value: yes.value !== null && yes.value === no.value ? yes.value : null, width };
  return { value: k.value !== 0n ? yes.value : no.value, width };
}

/** $past(e, n): e n cycles before (1 when n is left out). */
function past(of: Node, cycles: Node | undefined, cycle: number, ev: Eval): Value {
  const n = cycles === undefined ? 1n : ev(cycles, cycle).value;
  if (n === null || n < 0n) throw new ExprError('$past takes a number of cycles');
  return ev(of, cycle - Number(n));
}

function sampled(node: Extract<Node, { type: 'fn' }>, cycle: number, ev: Eval): Value {
  const [first, second] = node.args;
  if (first === undefined) throw new ExprError(`${node.name} needs an expression`);
  if (node.name === '$past') return past(first, second, cycle, ev);
  const now = ev(first, cycle).value;
  const before = ev(first, cycle - 1).value;
  if (now === null || before === null) return { value: null, width: 1 };
  const results: Record<Exclude<SvaFunction, '$past'>, boolean> = {
    $rose: (now & 1n) === 1n && (before & 1n) === 0n,
    $fell: (now & 1n) === 0n && (before & 1n) === 1n,
    $stable: now === before,
    $changed: now !== before,
  };
  return { value: results[node.name] ? 1n : 0n, width: 1 };
}

/** The expression's value in a cycle, reading the trace through `read`. */
export function evaluate(tree: Node, cycle: number, read: Read): Value {
  const ev: Eval = (node, c) => {
    switch (node.type) {
      case 'num':
        return { value: node.value, width: node.width };
      case 'sig':
        return c < 0 ? { value: null, width: read(node.name, 0).width } : read(node.name, c);
      case 'select':
        return select(node, c, ev);
      case 'unary':
        return unary(node, c, ev);
      case 'bin':
        return binary(node, c, ev);
      case 'cond':
        return conditional(node, c, ev);
      case 'fn':
        return sampled(node, c, ev);
    }
  };
  return ev(tree, cycle);
}

/** A value as the trace writes it: binary, x when unknown. */
export function toBits(result: Value): string {
  if (result.value === null) return 'x'.repeat(Math.max(1, result.width));
  return result.value.toString(2).padStart(result.width, '0').slice(-result.width);
}

/** A trace's binary value as a number, or null with x or z in it. */
export function fromBits(value: string): bigint | null {
  const v = value.toLowerCase();
  return /^[01]+$/.test(v) ? BigInt(`0b${v}`) : null;
}
