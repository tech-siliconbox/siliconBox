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

/**
 * An author's own page markup, kept complete and shown in the site's design (ADR 0024).
 * Sanitised to an allow-list on every read; links to other lessons are written `lesson:<slug>`
 * and the course home `course:<slug>`, resolved on the server.
 */
export const COURSE_HTML_MAX = 400_000;
const HtmlBlock = z.object({
  blockType: z.literal('html'),
  html: z.string().trim().min(1).max(COURSE_HTML_MAX),
});

/** A Drill shown inside a lesson (for example after a lab), with the tool to practise on it. */
const DrillEmbedBlock = z.object({
  blockType: z.literal('drillEmbed'),
  drill: SlugSchema,
});

/** A course's graded assessment, answered in the page (ADR 0029). */
const AssessmentEmbedBlock = z.object({
  blockType: z.literal('assessmentEmbed'),
  assessment: SlugSchema,
});

/** A course's capstone project: its rubric, the upload and the expert's grade (ADR 0029). */
const CapstoneEmbedBlock = z.object({
  blockType: z.literal('capstoneEmbed'),
  capstone: SlugSchema,
});

export const LessonBlockSchema = z.discriminatedUnion('blockType', [
  ...CONTENT_BLOCKS,
  StateGraphBlock,
  RevealBlock,
  HtmlBlock,
  DrillEmbedBlock,
  AssessmentEmbedBlock,
  CapstoneEmbedBlock,
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

/** What a part of a lesson is: reading, hands-on work on the tool, questions, or a project. */
export const SECTION_KINDS = ['theory', 'lab', 'practice', 'project'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** One part of an author's page (an `h2`): where it starts, what it is and its share of the time. */
export const LessonSectionSchema = z.object({
  anchor: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(SECTION_KINDS),
  minutes: z.number().int().positive().nullish(),
  hasDrill: z.boolean(),
});
export type LessonSection = z.infer<typeof LessonSectionSchema>;

/** Public outline data: titles, parts and times only, never lesson text. */
export const OutlineLessonSchema = z.object({
  publicId: PublicIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
  preview: z.boolean(),
  durationMinutes: z.number().int().positive().nullish(),
  sections: z.array(LessonSectionSchema).nullish(),
});
/** Public outline data for a Drill: its title only. */
export const OutlineDrillSchema = z.object({
  publicId: PublicIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
});
export const OutlineModuleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullish(),
  lessons: z.array(OutlineLessonSchema),
  drills: z.array(OutlineDrillSchema).default([]),
});
/**
 * Whether a course is open, or still being written: a course coming soon says so in the
 * catalogue and on pricing, shows no outline, and none of its lessons or Drills is served.
 */
export const COURSE_AVAILABILITY = ['open', 'comingSoon'] as const;
export type CourseAvailability = (typeof COURSE_AVAILABILITY)[number];

export const CourseOutlineSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  level: LevelSchema,
  summary: z.string().nullish(),
  // The course home page in the author's markup, shown instead of the plain outline (public).
  introduction: z.string().max(COURSE_HTML_MAX).nullish(),
  /** Coming soon: its modules are left out (an empty list). */
  comingSoon: z.boolean().default(false),
  modules: z.array(OutlineModuleSchema),
});
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;
