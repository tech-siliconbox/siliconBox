import {
  CALLOUT_TONES,
  CODE_LANGUAGES,
  HEADING_LEVELS,
  type LessonBlockType,
} from '@siliconbox/shared';
import type { Block } from 'payload';

// Editor forms for the block types in packages/shared/src/schemas/lesson.ts. No video block.

const options = (values: readonly (string | number)[]) =>
  values.map((value) => ({ label: String(value), value: String(value) }));

const svgOnly = (value: unknown) =>
  typeof value === 'string' && value.trim().startsWith('<svg') ? true : 'Paste inline SVG markup.';

type LessonBlockConfig = Block & { slug: LessonBlockType };

export const LESSON_BLOCKS: LessonBlockConfig[] = [
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
  { slug: 'paragraph', fields: [{ name: 'text', type: 'textarea', required: true }] },
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
      { name: 'text', type: 'textarea', required: true },
    ],
  },
  {
    slug: 'diagram',
    fields: [
      { name: 'svg', type: 'code', required: true, validate: svgOnly, admin: { language: 'html' } },
      { name: 'alt', type: 'text', required: true, maxLength: 300 },
    ],
  },
];
