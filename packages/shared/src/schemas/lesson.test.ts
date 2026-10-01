import { describe, expect, it } from 'vitest';
import { LessonBlockSchema, PublishedLessonSchema } from './lesson';

const lesson = {
  publicId: '0f5d8a4e-6c1b-4b7e-9a3d-2f1c0b9e8d7a',
  title: 'Invented lesson',
  preview: false,
  durationMinutes: 10,
  blocks: [
    { blockType: 'heading', level: '2', text: 'What you will do', id: 'cms-id', blockName: null },
    { blockType: 'paragraph', text: 'Invented paragraph text.' },
    { blockType: 'assertion', code: 'assert property (req |-> ##1 ack);', caption: null },
  ],
};

describe('lesson schemas', () => {
  it('keeps the learner fields and drops CMS extras', () => {
    const parsed = PublishedLessonSchema.parse({ ...lesson, _status: 'published', module: 'x' });
    expect(parsed).not.toHaveProperty('_status');
    expect(parsed.blocks[0]).toEqual({
      blockType: 'heading',
      level: '2',
      text: 'What you will do',
    });
  });

  it.each([
    ['an unknown block type', { blockType: 'video', url: 'https://example.test/v.mp4' }],
    ['a heading level outside 2 and 3', { blockType: 'heading', level: '1', text: 'x' }],
    ['a diagram that is not SVG', { blockType: 'diagram', svg: '<img src=x>', alt: 'x' }],
    ['an unsupported code language', { blockType: 'code', language: 'python', code: 'x' }],
  ])('rejects %s', (_label, block) => {
    expect(LessonBlockSchema.safeParse(block).success).toBe(false);
  });
});
