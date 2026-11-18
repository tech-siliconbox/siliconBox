import type { PublishedLesson } from '@siliconbox/shared';
import { describe, expect, it } from 'vitest';
import { findMarks } from './invisible-mark';
import { markLesson } from './lessons';

const lesson: PublishedLesson = {
  publicId: '0f5d8a4e-6c1b-4b7e-9a3d-2f1c0b9e8d7a',
  title: 'Invented lesson',
  preview: false,
  blocks: [
    { blockType: 'heading', level: '2', text: 'Invented heading' },
    { blockType: 'paragraph', text: 'Invented paragraph text.' },
    { blockType: 'code', language: 'systemverilog', code: 'module m; endmodule' },
    { blockType: 'callout', tone: 'tip', text: 'Invented tip.' },
    { blockType: 'list', items: [{ text: 'Invented item.', answer: 'Invented answer.' }] },
    {
      blockType: 'reveal',
      label: 'Show hints',
      content: [{ blockType: 'paragraph', text: 'Invented hint.' }],
    },
  ],
};

describe('markLesson', () => {
  it('marks every paragraph and callout, and leaves code copyable as written', () => {
    const [heading, paragraph, code, callout] = markLesson(lesson, 42).blocks;
    expect(paragraph?.blockType === 'paragraph' && findMarks(paragraph.text)).toEqual([42]);
    expect(callout?.blockType === 'callout' && findMarks(callout.text)).toEqual([42]);
    expect(heading).toEqual(lesson.blocks[0]);
    expect(code).toEqual(lesson.blocks[2]);
  });

  it('marks list items and the prose inside reveals', () => {
    const [, , , , list, reveal] = markLesson(lesson, 7).blocks;
    expect(list?.blockType === 'list' && findMarks(list.items[0]?.text ?? '')).toEqual([7]);
    const hint = reveal?.blockType === 'reveal' ? reveal.content[0] : undefined;
    expect(hint?.blockType === 'paragraph' && findMarks(hint.text)).toEqual([7]);
  });
});
