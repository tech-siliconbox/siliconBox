import { z } from 'zod';
import { DRILL_MODES, DRILL_SOLVERS, DRILL_TARGETS, TOP_MODULE_PATTERN } from './drill';
import { COURSE_HTML_MAX, LessonBlockSchema, SlugSchema } from './lesson';
import { LevelSchema } from './level';

// The JSON file `pnpm content:import` reads. Documents are matched by slug, so importing again
// updates what is there (keeping each lesson's public URL) instead of creating copies.

const StatusSchema = z.enum(['draft', 'published']).default('draft');
const title = z.string().trim().min(1).max(200);
const order = z.number().int().min(1);

const ImportLessonSchema = z.strictObject({
  slug: SlugSchema,
  title,
  order,
  preview: z.boolean().default(false),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  status: StatusSchema,
  blocks: z.array(LessonBlockSchema).min(1),
});

const code = z
  .string()
  .trim()
  .min(1)
  .max(64 * 1024);

/**
 * The private half of a Drill: never shown to learners. The publish gate
 * (`pnpm drills:verify`) runs the reference solution on the real solver: it must give the
 * Drill's target on the Drill's design, PASS on `referenceDesign` (the correct design, when the
 * learner is shown a buggy one) and FAIL on every bug variant.
 */
const ImportDrillPrivateSchema = z.strictObject({
  referenceSolution: code,
  referenceDesign: code.optional(),
  hiddenProperties: code.optional(),
  bugVariants: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(80),
        code,
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1),
});

const ImportDrillSchema = z.strictObject({
  slug: SlugSchema,
  title,
  order,
  topic: z.string().trim().max(100).optional(),
  mode: z.enum(DRILL_MODES),
  solver: z.enum(DRILL_SOLVERS),
  target: z.enum(DRILL_TARGETS),
  depth: z.number().int().min(1),
  timeoutSeconds: z.number().int().min(1),
  topModule: z.string().regex(TOP_MODULE_PATTERN),
  // Drills go in as drafts: an editor publishes after review and a passing gate.
  status: StatusSchema,
  brief: z.array(LessonBlockSchema).min(1),
  designCode: code.optional(),
  starterCode: code,
  private: ImportDrillPrivateSchema,
});
export type ImportDrill = z.infer<typeof ImportDrillSchema>;

// A module lists lessons, Drills or both; a file may carry only Drills for modules whose
// lessons were imported before (pruning only touches the kinds a file lists).
const ImportModuleSchema = z
  .strictObject({
    slug: SlugSchema,
    title,
    summary: z.string().trim().max(300).optional(),
    order,
    lessons: z.array(ImportLessonSchema).default([]),
    drills: z.array(ImportDrillSchema).default([]),
  })
  .refine((module) => module.lessons.length + module.drills.length > 0, {
    message: 'A module needs at least one lesson or Drill',
  });

const ImportCourseSchema = z.strictObject({
  slug: SlugSchema,
  title,
  level: LevelSchema,
  summary: z.string().trim().max(600).optional(),
  introduction: z.string().trim().max(COURSE_HTML_MAX).optional(),
  order,
  status: StatusSchema,
  modules: z.array(ImportModuleSchema).min(1),
});

export const ContentImportSchema = z
  .strictObject({ courses: z.array(ImportCourseSchema).min(1) })
  .superRefine((content, ctx) => {
    for (const slug of duplicateSlugs(content)) {
      ctx.addIssue({ code: 'custom', message: `Slug "${slug}" is used more than once` });
    }
  });
export type ContentImport = z.infer<typeof ContentImportSchema>;

/** Slugs must be unique per kind (the CMS enforces it); report every repeat. */
function duplicateSlugs(content: {
  courses: {
    slug: string;
    modules: { slug: string; lessons: { slug: string }[]; drills: { slug: string }[] }[];
  }[];
}): string[] {
  const modules = content.courses.flatMap((course) => course.modules);
  const kinds = [
    content.courses.map((course) => course.slug),
    modules.map((module) => module.slug),
    modules.flatMap((module) => module.lessons.map((lesson) => lesson.slug)),
    modules.flatMap((module) => module.drills.map((drill) => drill.slug)),
  ];
  return kinds.flatMap((slugs) => slugs.filter((slug, index) => slugs.indexOf(slug) !== index));
}
