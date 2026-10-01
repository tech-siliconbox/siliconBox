import { describe, expect, it } from 'vitest';
import { embedMark, findMarks, markCode } from './invisible-mark';

const SECRET = 'x'.repeat(32);

describe('invisible mark', () => {
  it('gives each learner a stable, different code', () => {
    expect(markCode('learner-a', SECRET)).toBe(markCode('learner-a', SECRET));
    expect(markCode('learner-a', SECRET)).not.toBe(markCode('learner-b', SECRET));
    expect(markCode('learner-a', SECRET)).not.toBe(markCode('learner-a', 'y'.repeat(32)));
  });

  it('is invisible: the visible characters are unchanged', () => {
    const text = 'Invented lesson paragraph about safety properties.';
    const marked = embedMark(text, markCode('learner-a', SECRET));
    expect(marked).not.toBe(text);
    expect(marked.replace(/[\u200B\u200C\u2063]/g, '')).toBe(text);
  });

  it('can be read back from copied text', () => {
    const code = markCode('learner-a', SECRET);
    const copied = `Someone pasted: ${embedMark('Invented paragraph text.', code)} and more`;
    expect(findMarks(copied)).toEqual([code]);
  });

  it.each([0, 1, 0xffffffff])('round-trips the edge code %i', (code) => {
    expect(findMarks(embedMark('One-word', code))).toEqual([code]);
  });
});
