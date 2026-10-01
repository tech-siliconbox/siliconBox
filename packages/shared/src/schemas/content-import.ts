import { z } from 'zod';
import { LessonBlockSchema, SlugSchema } from './lesson';
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

const ImportModuleSchema = z.strictObject({
  slug: SlugSchema,
  title,
  summary: z.string().trim().max(300).optional(),
  order,
  lessons: z.array(ImportLessonSchema).min(1),
});

const ImportCourseSchema = z.strictObject({
  slug: SlugSchema,
  title,
  level: LevelSchema,
  summary: z.string().trim().max(600).optional(),
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
  courses: { slug: string; modules: { slug: string; lessons: { slug: string }[] }[] }[];
}): string[] {
  const modules = content.courses.flatMap((course) => course.modules);
  const kinds = [
    content.courses.map((course) => course.slug),
    modules.map((module) => module.slug),
    modules.flatMap((module) => module.lessons.map((lesson) => lesson.slug)),
  ];
  return kinds.flatMap((slugs) => slugs.filter((slug, index) => slugs.indexOf(slug) !== index));
}
