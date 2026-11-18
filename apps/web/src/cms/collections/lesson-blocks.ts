import {
  CALLOUT_TONES,
  CODE_LANGUAGES,
  HEADING_LEVELS,
  type LessonBlockType,
  STATE_GRAPH_LIMITS,
  stateGraphProblems,
  type RevealContentBlock,
} from '@siliconbox/shared';
import type { Block } from 'payload';

// Editor forms for the block types in packages/shared/src/schemas/lesson.ts. No video block.
// Text fields use the lesson text format: `code`, **bold**, *italic*; in multi-line fields a
// blank line starts a new paragraph and lines starting with "- " are bullets.

const TEXT_FORMAT_HINT =
  'Use `code`, **bold** and *italic*. A blank line starts a paragraph; "- " starts a bullet.';

const options = (values: readonly (string | number)[]) =>
  values.map((value) => ({ label: String(value), value: String(value) }));

const svgOnly = (value: unknown) =>
  typeof value === 'string' && value.trim().startsWith('<svg') ? true : 'Paste inline SVG markup.';

type LessonBlockConfig = Block & { slug: LessonBlockType };
type RevealContentBlockConfig = Block & { slug: RevealContentBlock['blockType'] };

const textArea = (name: string, required = true) =>
  ({ name, type: 'textarea', required, admin: { description: TEXT_FORMAT_HINT } }) as const;

const CONTENT_BLOCKS: RevealContentBlockConfig[] = [
  {
    slug: 'heading',
    fields: [
      {
        name: 'level',
        type: 'select',
        required: true,
        defaultValue: '2',
        options: options(HEADING_LEVELS),
      },
      { name: 'text', type: 'text', required: true, maxLength: 200 },
    ],
  },
  { slug: 'paragraph', fields: [textArea('text')] },
  {
    slug: 'code',
    fields: [
      {
        name: 'language',
        type: 'select',
        required: true,
        defaultValue: 'systemverilog',
        options: options(CODE_LANGUAGES),
      },
      { name: 'code', type: 'code', required: true },
      { name: 'filename', type: 'text', maxLength: 120 },
    ],
  },
  {
    slug: 'assertion',
    fields: [
      { name: 'code', type: 'code', required: true },
      { name: 'caption', type: 'text', maxLength: 300 },
    ],
  },
  {
    slug: 'callout',
    fields: [
      {
        name: 'tone',
        type: 'select',
        required: true,
        defaultValue: 'note',
        options: options(CALLOUT_TONES),
      },
      { name: 'title', type: 'text', maxLength: 300 },
      textArea('text'),
    ],
  },
  {
    slug: 'diagram',
    fields: [
      { name: 'svg', type: 'code', required: true, validate: svgOnly, admin: { language: 'html' } },
      { name: 'alt', type: 'text', required: true, maxLength: 300 },
      textArea('caption', false),
    ],
  },
  {
    slug: 'list',
    fields: [
      { name: 'ordered', type: 'checkbox', defaultValue: false },
      {
        name: 'start',
        type: 'number',
        min: 1,
        max: 1000,
        admin: { description: 'Optional first number, for a numbered list that continues.' },
      },
      {
        name: 'items',
        type: 'array',
        required: true,
        minRows: 1,
        maxRows: 100,
        fields: [
          textArea('text'),
          {
            ...textArea('answer', false),
            admin: { description: 'Optional. Shown behind a "Show answer" button.' },
          },
        ],
      },
    ],
  },
  {
    slug: 'table',
    fields: [
      {
        name: 'columns',
        type: 'array',
        required: true,
        minRows: 1,
        maxRows: 12,
        fields: [{ name: 'text', type: 'text' }],
      },
      {
        name: 'rows',
        type: 'array',
        required: true,
        minRows: 1,
        maxRows: 200,
        fields: [
          {
            name: 'cells',
            type: 'array',
            required: true,
            minRows: 1,
            maxRows: 12,
            fields: [textArea('text', false)],
          },
        ],
      },
    ],
  },
];

type GraphRows = Parameters<typeof stateGraphProblems>[0];

/** Same graph rules the site applies when it reads the lesson. */
const validTransitions = (
  transitions: unknown,
  { siblingData }: { siblingData: Partial<GraphRows> },
): true | string => {
  const problems = stateGraphProblems({
    states: siblingData.states ?? [],
    transitions: Array.isArray(transitions) ? (transitions as GraphRows['transitions']) : [],
  });
  return problems.length === 0 ? true : problems.join('. ');
};

const label = (name: string) => ({ name, type: 'text', required: true, maxLength: 300 }) as const;

const coordinate = (name: string) =>
  ({ name, type: 'number', required: true, min: 0, max: STATE_GRAPH_LIMITS.canvas }) as const;

export const LESSON_BLOCKS: LessonBlockConfig[] = [
  ...CONTENT_BLOCKS,
  {
    slug: 'reveal',
    labels: { singular: 'Reveal (show / hide)', plural: 'Reveals' },
    fields: [
      { ...label('label'), admin: { description: 'Button text, for example "Show hints".' } },
      { name: 'content', type: 'blocks', required: true, minRows: 1, blocks: CONTENT_BLOCKS },
    ],
  },
  {
    slug: 'stateGraph',
    labels: { singular: 'State graph (simulation vs formal)', plural: 'State graphs' },
    fields: [
      label('simulationTitle'),
      label('simulationText'),
      label('formalTitle'),
      label('formalText'),
      {
        name: 'testLength',
        type: 'number',
        required: true,
        min: 1,
        max: STATE_GRAPH_LIMITS.testLength,
        admin: { description: 'Cycles per random test.' },
      },
      {
        name: 'states',
        type: 'array',
        required: true,
        minRows: 2,
        maxRows: STATE_GRAPH_LIMITS.nodes,
        admin: { description: 'The first state is the reset state.' },
        fields: [
          { name: 'label', type: 'text', required: true, maxLength: 12 },
          coordinate('x'),
          coordinate('y'),
          { name: 'note', type: 'text', maxLength: 20 },
          { name: 'hidesBug', type: 'checkbox', defaultValue: false },
        ],
      },
      {
        name: 'transitions',
        type: 'array',
        required: true,
        minRows: 1,
        maxRows: STATE_GRAPH_LIMITS.nodes * 4,
        validate: validTransitions,
        admin: {
          description:
            'Chance (0 to 1) that a random test takes this step; what is left returns to reset.',
        },
        fields: [
          { name: 'from', type: 'text', required: true, maxLength: 12 },
          { name: 'to', type: 'text', required: true, maxLength: 12 },
          { name: 'chance', type: 'number', required: true, min: 0, max: 1 },
        ],
      },
    ],
  },
];
