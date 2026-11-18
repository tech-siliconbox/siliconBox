// The inline format of lesson text: `code` (or ``code with a ` inside``), **strong** and
// *emphasis*, with a backslash escaping the next character. Kept tiny on purpose: authors type
// it in the CMS, the HTML converter writes it, and the server renders it.

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong' | 'em'; children: InlineNode[] };

const ESCAPABLE = new Set(['\\', '`', '*']);

/** Splits inline text into nodes. Unclosed markers stay as literal text. */
export function parseInlineText(source: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let text = '';
  const flush = () => {
    if (text) nodes.push({ kind: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);
    const next = source.charAt(i + 1);
    if (char === '\\' && ESCAPABLE.has(next)) {
      text += next;
      i += 2;
      continue;
    }
    const span = char === '`' ? readCode(source, i) : char === '*' ? readEmphasis(source, i) : null;
    if (span === null) {
      text += char;
      i += 1;
      continue;
    }
    flush();
    nodes.push(span.node);
    i = span.end;
  }
  flush();
  return nodes;
}

type Span = { node: InlineNode; end: number };

function runLength(source: string, start: number, char: string): number {
  let end = start;
  while (source.charAt(end) === char) end += 1;
  return end - start;
}

/** A code span closes at the next backtick run of the same length (as in Markdown). */
function readCode(source: string, start: number): Span | null {
  const fence = runLength(source, start, '`');
  let at = start + fence;
  while (at < source.length) {
    const close = source.indexOf('`', at);
    if (close === -1) return null;
    const length = runLength(source, close, '`');
    if (length === fence) {
      const body = source.slice(start + fence, close);
      const padded = body.length > 1 && body.startsWith(' ') && body.endsWith(' ');
      return {
        node: { kind: 'code', text: padded ? body.slice(1, -1) : body },
        end: close + fence,
      };
    }
    at = close + length;
  }
  return null;
}

/** `**` opens strong, `*` opens emphasis; the marker must touch text on its inner side. */
function readEmphasis(source: string, start: number): Span | null {
  const marker = source.startsWith('**', start) ? '**' : '*';
  const from = start + marker.length;
  if (/\s/.test(source.charAt(from)) || from >= source.length) return null;
  const close = findCloser(source, from, marker);
  if (close === -1) return null;
  const children = parseInlineText(source.slice(from, close));
  return {
    node: { kind: marker === '**' ? 'strong' : 'em', children },
    end: close + marker.length,
  };
}

/** Next unescaped closing marker outside a code span. */
function findCloser(source: string, from: number, marker: string): number {
  let i = from;
  while (i < source.length) {
    const char = source.charAt(i);
    if (char === '\\') {
      i += 2;
    } else if (char === '`') {
      const code = readCode(source, i);
      i = code === null ? i + 1 : code.end;
    } else if (source.startsWith(marker, i) && !/\s/.test(source.charAt(i - 1))) {
      const doubled = marker === '*' && source.charAt(i + 1) === '*';
      if (!doubled) return i;
      i += 2;
    } else {
      i += 1;
    }
  }
  return -1;
}

/** Escapes plain text so none of it is read as markup. */
export function escapeInlineText(text: string): string {
  return text.replace(/[\\`*]/g, (char) => `\\${char}`);
}

/** Wraps text as a code span, with a fence longer than any backtick run inside it. */
export function inlineCode(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}
