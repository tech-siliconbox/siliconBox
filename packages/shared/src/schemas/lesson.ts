import { z } from 'zod';
import { LevelSchema } from './level';

// Content exactly as the CMS stores it, used to validate import files and to read published
// lessons for learners. Stored documents carry extra CMS fields (ids, timestamps); these schemas
// keep only what the site uses.

export const CODE_LANGUAGES = ['systemverilog', 'sby', 'text'] as const;
export const CALLOUT_TONES = ['note', 'tip', 'warning', 'danger'] as const;
export const HEADING_LEVELS = ['2', '3', '4'] as const;

// Text fields use the inline format in ../inline-text.ts. Multi-line text (callouts, list
// items, answers, table cells) may hold paragraphs separated by a blank line and "- " bullets.
const text = z.string().trim().min(1).max(20_000);
const label = z.string().trim().min(1).max(300);
const optionalLabel = z.string().trim().max(300).nullish();

/** URL-safe identifier shared by the CMS and the content importer. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SlugSchema = z.string().regex(SLUG_PATTERN).max(120);

const HeadingBlock = z.object({
  blockType: z.literal('heading'),
  // Stored as text, like every CMS select value.
  level: z.enum(HEADING_LEVELS),
  text: z.string().trim().min(1).max(200),
});
const ParagraphBlock = z.object({ blockType: z.literal('paragraph'), text });
const CodeBlock = z.object({
  blockType: z.literal('code'),
  language: z.enum(CODE_LANGUAGES),
  code: text,
  filename: z.string().trim().max(120).nullish(),
});
const AssertionBlock = z.object({
  blockType: z.literal('assertion'),
  code: text,
  caption: optionalLabel,
});
const CalloutBlock = z.object({
  blockType: z.literal('callout'),
  tone: z.enum(CALLOUT_TONES),
  title: optionalLabel,
  text,
});
const DiagramBlock = z.object({
  blockType: z.literal('diagram'),
  svg: z.string().trim().startsWith('<svg').max(100_000),
  alt: label,
  // Visible caption under the diagram, in the inline text format.
  caption: z.string().trim().max(2_000).nullish(),
});
const ListBlock = z.object({
  blockType: z.literal('list'),
  // The CMS stores an untouched checkbox as null.
  ordered: z.boolean().nullish(),
  // First number of an ordered list that continues after a table or other block.
  start: z.number().int().min(1).max(1000).nullish(),
  // `answer` is hidden behind "Show answer", for review questions.
  items: z
    .array(z.object({ text, answer: text.nullish() }))
    .min(1)
    .max(100),
});
const cell = z.object({ text: z.string().trim().max(2_000).nullish() });
const TableBlock = z.object({
  blockType: z.literal('table'),
  columns: z.array(cell).min(1).max(12),
  rows: z
    .array(z.object({ cells: z.array(cell).min(1).max(12) }))
    .min(1)
    .max(200),
});
// An interactive state graph: random tests from reset against breadth-first formal search.
// The graph and its text live in the lesson; the site only supplies the animation.
export const STATE_GRAPH_LIMITS = { nodes: 30, testLength: 50, canvas: 1000 } as const;
const coordinate = z.number().min(0).max(STATE_GRAPH_LIMITS.canvas);
const StateGraphBlock = z
  .object({
    blockType: z.literal('stateGraph'),
    simulationTitle: label,
    simulationText: label,
    formalTitle: label,
    formalText: label,
    // Cycles per random test.
    testLength: z.number().int().min(1).max(STATE_GRAPH_LIMITS.testLength),
    // The first state is the reset state.
    states: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(12),
          x: coordinate,
          y: coordinate,
          note: z.string().trim().max(20).nullish(),
          hidesBug: z.boolean().nullish(),
        }),
      )
      .min(2)
      .max(STATE_GRAPH_LIMITS.nodes),
    // `chance` is how often a random test takes this transition; the rest returns to reset.
    transitions: z
      .array(
        z.object({
          from: z.string().trim().min(1).max(12),
          to: z.string().trim().min(1).max(12),
          chance: z.number().min(0).max(1),
        }),
      )
      .min(1)
      .max(STATE_GRAPH_LIMITS.nodes * 4),
  })
  .superRefine((graph, ctx) => {
    for (const problem of stateGraphProblems(graph))
      ctx.addIssue({ code: 'custom', message: problem });
  });

type GraphShape = {
  states: { label: string }[];
  transitions: { from: string; to: string; chance: number }[];
};

/** Labels are unique, transitions name real states, and no state's chances add up past 1. */
export function stateGraphProblems({ states, transitions }: GraphShape): string[] {
  const labels = states.map((state) => state.label);
  const problems = labels
    .filter((label, index) => labels.indexOf(label) !== index)
    .map((label) => `State "${label}" is listed twice`);
  const known = new Set(labels);
  const totals = new Map<string, number>();
  for (const { from, to, chance } of transitions) {
    for (const end of [from, to]) {
      if (!known.has(end)) problems.push(`Transition uses unknown state "${end}"`);
    }
    totals.set(from, (totals.get(from) ?? 0) + chance);
  }
  for (const [from, total] of totals) {
    if (total > 1 + 1e-9) problems.push(`Chances out of "${from}" add up to more than 1`);
  }
  return problems;
}

const CONTENT_BLOCKS = [
  HeadingBlock,
  ParagraphBlock,
  CodeBlock,
  AssertionBlock,
  CalloutBlock,
  DiagramBlock,
  ListBlock,
  TableBlock,
] as const;

/** Blocks that can sit inside a reveal (no nesting, no interactive blocks). */
export const RevealContentBlockSchema = z.discriminatedUnion('blockType', CONTENT_BLOCKS);
export type RevealContentBlock = z.infer<typeof RevealContentBlockSchema>;

const RevealBlock = z.object({
  blockType: z.literal('reveal'),
  // The button text, for example "Show hints".
  label,
  content: z.array(RevealContentBlockSchema).min(1).max(50),
});

export const LessonBlockSchema = z.discriminatedUnion('blockType', [
  ...CONTENT_BLOCKS,
  StateGraphBlock,
  RevealBlock,
]);
export type LessonBlock = z.infer<typeof LessonBlockSchema>;
export type LessonBlockType = LessonBlock['blockType'];

/** Opaque public id used in URLs, never the database id. */
export const PublicIdSchema = z.uuid();

export const PublishedLessonSchema = z.object({
  publicId: PublicIdSchema,
  title: z.string().min(1),
  preview: z.boolean(),
  durationMinutes: z.number().int().positive().nullish(),
  blocks: z.array(LessonBlockSchema),
});
export type PublishedLesson = z.infer<typeof PublishedLessonSchema>;

/** Public outline data: titles and order only, never lesson text. */
export const OutlineLessonSchema = z.object({
  publicId: PublicIdSchema,
  title: z.string().min(1),
  preview: z.boolean(),
  durationMinutes: z.number().int().positive().nullish(),
});
/** Public outline data for a Drill: its title only. */
export const OutlineDrillSchema = z.object({ publicId: PublicIdSchema, title: z.string().min(1) });
export const OutlineModuleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullish(),
  lessons: z.array(OutlineLessonSchema),
  drills: z.array(OutlineDrillSchema).default([]),
});
export const CourseOutlineSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  level: LevelSchema,
  summary: z.string().nullish(),
  modules: z.array(OutlineModuleSchema),
});
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;
