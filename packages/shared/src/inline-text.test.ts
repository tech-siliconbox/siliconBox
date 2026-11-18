import { describe, expect, it } from 'vitest';
import { escapeInlineText, inlineCode, parseInlineText } from './inline-text';

describe('parseInlineText', () => {
  it('reads code, strong and emphasis', () => {
    expect(parseInlineText('Use `assert` for **every** *check*.')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'code', text: 'assert' },
      { kind: 'text', text: ' for ' },
      { kind: 'strong', children: [{ kind: 'text', text: 'every' }] },
      { kind: 'text', text: ' ' },
      { kind: 'em', children: [{ kind: 'text', text: 'check' }] },
      { kind: 'text', text: '.' },
    ]);
  });

  it('keeps stars inside code spans as code', () => {
    expect(parseInlineText('`a [*3]` then `b`')).toEqual([
      { kind: 'code', text: 'a [*3]' },
      { kind: 'text', text: ' then ' },
      { kind: 'code', text: 'b' },
    ]);
  });

  it('reads a longer fence so code can hold a backtick', () => {
    expect(parseInlineText('Macros like `` `define `` expand.')).toEqual([
      { kind: 'text', text: 'Macros like ' },
      { kind: 'code', text: '`define' },
      { kind: 'text', text: ' expand.' },
    ]);
  });

  it('allows code inside strong', () => {
    expect(parseInlineText('**the `full` flag**')).toEqual([
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'the ' },
          { kind: 'code', text: 'full' },
          { kind: 'text', text: ' flag' },
        ],
      },
    ]);
  });

  it.each([
    ['an unclosed code span', 'a `b'],
    ['an unclosed star', 'a * b'],
    ['a star followed by a space', '2 * 3 * 4'],
  ])('leaves %s as text', (_label, source) => {
    expect(parseInlineText(source)).toEqual([{ kind: 'text', text: source }]);
  });

  it('honours escapes', () => {
    expect(parseInlineText('\\*not em\\* and \\`not code\\`')).toEqual([
      { kind: 'text', text: '*not em* and `not code`' },
    ]);
  });
});

describe('writing inline text', () => {
  it.each(['a*b`c\\d', '**x**', '`y`'])('escaped text %s reads back unchanged', (text) => {
    expect(parseInlineText(escapeInlineText(text))).toEqual([{ kind: 'text', text }]);
  });

  it.each(['a [*3]', '`define', 'x `` y', 'plain'])('code %s reads back unchanged', (text) => {
    expect(parseInlineText(inlineCode(text))).toEqual([{ kind: 'code', text }]);
  });
});
