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

const STATE_GRAPH = {
  blockType: 'stateGraph',
  simulationTitle: 'Invented simulation',
  simulationText: 'Random tests from reset.',
  formalTitle: 'Invented formal',
  formalText: 'Every state, depth by depth.',
  testLength: 5,
  states: [
    { label: 'S0', x: 40, y: 40, note: 'reset' },
    { label: 'S1', x: 120, y: 40, hidesBug: true },
  ],
  transitions: [{ from: 'S0', to: 'S1', chance: 0.5 }],
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

  it('accepts lists, tables, reveals and widgets as the CMS stores them', () => {
    const blocks = [
      {
        blockType: 'list',
        ordered: null,
        items: [{ id: 'a', text: 'Invented question?', answer: 'Invented answer.' }],
      },
      {
        blockType: 'table',
        columns: [{ id: 'c', text: 'Term' }, { text: null }],
        rows: [{ id: 'r', cells: [{ text: '`a`' }, { text: 'b' }] }],
      },
      {
        blockType: 'reveal',
        label: 'Show hints',
        content: [{ blockType: 'paragraph', text: 'Invented hint.' }],
      },
      STATE_GRAPH,
    ];
    for (const block of blocks) expect(LessonBlockSchema.safeParse(block).success).toBe(true);
  });

  it.each([
    [
      'a reveal inside a reveal',
      {
        blockType: 'reveal',
        label: 'x',
        content: [{ blockType: 'reveal', label: 'y', content: [] }],
      },
    ],
    [
      'a state graph with a transition to a missing state',
      { ...STATE_GRAPH, transitions: [{ from: 'S0', to: 'S9', chance: 0.5 }] },
    ],
    [
      'a state graph whose chances add up past 1',
      {
        ...STATE_GRAPH,
        transitions: [
          { from: 'S0', to: 'S1', chance: 0.7 },
          { from: 'S0', to: 'S1', chance: 0.7 },
        ],
      },
    ],
    ['an empty list', { blockType: 'list', items: [] }],
    ['an unknown block type', { blockType: 'video', url: 'https://example.test/v.mp4' }],
    ['a heading level outside 2 to 4', { blockType: 'heading', level: '1', text: 'x' }],
    ['a diagram that is not SVG', { blockType: 'diagram', svg: '<img src=x>', alt: 'x' }],
    ['an unsupported code language', { blockType: 'code', language: 'python', code: 'x' }],
  ])('rejects %s', (_label, block) => {
    expect(LessonBlockSchema.safeParse(block).success).toBe(false);
  });
});
