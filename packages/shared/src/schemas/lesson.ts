import { z } from 'zod';
import { LevelSchema } from './level';

// Content exactly as the CMS stores it, used to validate import files and to read published
// lessons for learners. Stored documents carry extra CMS fields (ids, timestamps); these schemas
// keep only what the site uses.

export const CODE_LANGUAGES = ['systemverilog', 'sby', 'text'] as const;
export const CALLOUT_TONES = ['note', 'tip', 'warning'] as const;
export const HEADING_LEVELS = ['2', '3'] as const;

const text = z.string().trim().min(1).max(20_000);

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
});
const AssertionBlock = z.object({
  blockType: z.literal('assertion'),
  code: text,
  caption: z.string().trim().max(300).nullish(),
});
const CalloutBlock = z.object({
  blockType: z.literal('callout'),
  tone: z.enum(CALLOUT_TONES),
  text,
});
const DiagramBlock = z.object({
  blockType: z.literal('diagram'),
  svg: z.string().trim().startsWith('<svg').max(100_000),
  alt: z.string().trim().min(1).max(300),
});

export const LessonBlockSchema = z.discriminatedUnion('blockType', [
  HeadingBlock,
  ParagraphBlock,
  CodeBlock,
  AssertionBlock,
  CalloutBlock,
  DiagramBlock,
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
export const OutlineModuleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullish(),
  lessons: z.array(OutlineLessonSchema),
});
export const CourseOutlineSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  level: LevelSchema,
  summary: z.string().nullish(),
  modules: z.array(OutlineModuleSchema),
});
export type CourseOutline = z.infer<typeof CourseOutlineSchema>;
