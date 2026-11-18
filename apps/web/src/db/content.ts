import 'server-only';
import {
  type CourseOutline,
  CourseOutlineSchema,
  DRILL_MODES,
  DRILL_SOLVERS,
  DRILL_TARGETS,
  type Level,
  LevelSchema,
  PublicIdSchema,
  type PublishedDrill,
  PublishedDrillSchema,
  type PublishedAssessment,
  PublishedAssessmentSchema,
  type PublishedCapstone,
  PublishedCapstoneSchema,
  type PublishedLesson,
  PublishedLessonSchema,
  TOP_MODULE_PATTERN,
} from '@siliconbox/shared';
import type { Document } from 'mongodb';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

// Reads what the CMS has published. Payload keeps drafts of a published document in its
// versions collection, so the main collections hold only published content (or a first,
// never-published draft, which `_status` filters out).

const PUBLISHED = 'published';

/** Joins modules, then the published course, onto the documents flowing through. */
function withModuleAndCourse(moduleField: string): Document[] {
  return [
    {
      $lookup: {
        from: COLLECTIONS.modules,
        localField: moduleField,
        foreignField: '_id',
        as: 'module',
      },
    },
    { $unwind: '$module' },
    {
      $lookup: {
        from: COLLECTIONS.courses,
        localField: 'module.course',
        foreignField: '_id',
        as: 'course',
      },
    },
    { $unwind: '$course' },
    { $match: { 'course._status': PUBLISHED } },
  ];
}

type Published = { document: Document; level: Level; courseSlug: string };

/** A published document by public id (or slug), with the level and slug of its course. */
async function findPublishedWithLevel(
  collection: string,
  match: { publicId: string } | { slug: string },
): Promise<Published | null> {
  const [found] = await getDb()
    .collection(collection)
    .aggregate([
      { $match: { ...match, _status: PUBLISHED } },
      { $limit: 1 },
      ...withModuleAndCourse('module'),
      {
        $project: {
          _id: 0,
          document: '$$ROOT',
          level: '$course.level',
          courseSlug: '$course.slug',
        },
      },
    ])
    .toArray();
  if (found === undefined) return null;
  return {
    document: found.document as Document,
    level: LevelSchema.parse(found.level),
    courseSlug: String(found.courseSlug),
  };
}

export type PublishedLessonInCourse = { lesson: PublishedLesson; level: Level; courseSlug: string };

/** A published lesson by slug (its page address) or by public id (the progress API). */
export async function findPublishedLesson(
  match: { publicId: string } | { slug: string },
): Promise<PublishedLessonInCourse | null> {
  const found = await findPublishedWithLevel(COLLECTIONS.lessons, match);
  return (
    found && {
      lesson: PublishedLessonSchema.parse(found.document),
      level: found.level,
      courseSlug: found.courseSlug,
    }
  );
}

/** The course of each published lesson, by lesson slug, for links between course pages. */
export async function findLessonCourses(slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const lessons = await getDb()
    .collection(COLLECTIONS.lessons)
    .aggregate([
      { $match: { slug: { $in: [...new Set(slugs)] }, _status: PUBLISHED } },
      ...withModuleAndCourse('module'),
      { $project: { _id: 0, slug: 1, courseSlug: '$course.slug' } },
    ])
    .toArray();
  return new Map(lessons.map((lesson) => [String(lesson.slug), String(lesson.courseSlug)]));
}

const DrillForRunSchema = z.object({
  publicId: PublicIdSchema,
  designCode: z
    .string()
    .nullish()
    .transform((code) => code ?? ''),
  mode: z.enum(DRILL_MODES),
  solver: z.enum(DRILL_SOLVERS),
  target: z.enum(DRILL_TARGETS),
  depth: z.number().int().positive(),
  timeoutSeconds: z.number().int().positive(),
  topModule: z.string().regex(TOP_MODULE_PATTERN),
});
/** `cmsId` links the Drill to its private part, which only grading may read (ADR 0021). */
export type DrillForRun = z.infer<typeof DrillForRunSchema> & { level: Level; cmsId: unknown };

export type PublishedDrillInCourse = { drill: PublishedDrill; level: Level; courseSlug: string };

/** A published Drill by slug, with its level and course. Never its private part. */
export async function findPublishedDrill(slug: string): Promise<PublishedDrillInCourse | null> {
  const found = await findPublishedWithLevel(COLLECTIONS.drills, { slug });
  return (
    found && {
      drill: PublishedDrillSchema.parse(found.document),
      level: found.level,
      courseSlug: found.courseSlug,
    }
  );
}

/** A published Drill's design and solver settings, for starting a run. Never its private part. */
export async function findPublishedDrillForRun(publicId: string): Promise<DrillForRun | null> {
  const found = await findPublishedWithLevel(COLLECTIONS.drills, { publicId });
  return (
    found && {
      ...DrillForRunSchema.parse(found.document),
      level: found.level,
      cmsId: found.document._id,
    }
  );
}

/** A module's published lessons or Drills, in order, with only the given fields. */
function publishedChildren(from: string, as: string, fields: Record<string, 1>) {
  return {
    $lookup: {
      from,
      localField: '_id',
      foreignField: 'module',
      as,
      pipeline: [
        { $match: { _status: PUBLISHED } },
        { $sort: { order: 1 } },
        { $project: { _id: 0, ...fields } },
      ],
    },
  };
}

/** Published courses with module, lesson and Drill titles only. Never lesson or Drill text. */
export async function findCourseOutlines(slug?: string): Promise<CourseOutline[]> {
  const documents = await getDb()
    .collection(COLLECTIONS.courses)
    .aggregate([
      { $match: { _status: PUBLISHED, ...(slug === undefined ? {} : { slug }) } },
      { $sort: { order: 1 } },
      {
        $lookup: {
          from: COLLECTIONS.modules,
          localField: '_id',
          foreignField: 'course',
          as: 'modules',
          pipeline: [
            { $sort: { order: 1 } },
            publishedChildren(COLLECTIONS.lessons, 'lessons', {
              publicId: 1,
              slug: 1,
              title: 1,
              preview: 1,
              durationMinutes: 1,
              sections: 1,
            }),
            publishedChildren(COLLECTIONS.drills, 'drills', { publicId: 1, slug: 1, title: 1 }),
            { $project: { _id: 0, title: 1, summary: 1, lessons: 1, drills: 1 } },
          ],
        },
      },
      {
        $project: {
          _id: 0,
          slug: 1,
          title: 1,
          level: 1,
          summary: 1,
          introduction: 1,
          modules: 1,
        },
      },
    ])
    .toArray();
  return documents.map((document) => CourseOutlineSchema.parse(document));
}

/** A published assessment or capstone with its course, and the CMS id its private part refers to. */
export type CourseWorkInCourse<T> = { work: T; cmsId: unknown; level: Level; courseSlug: string };

async function findCourseWork<T>(
  collection: string,
  schema: z.ZodType<T>,
  match: { publicId: string } | { slug: string },
): Promise<CourseWorkInCourse<T> | null> {
  const found = await findPublishedWithLevel(collection, match);
  return (
    found && {
      work: schema.parse(found.document),
      cmsId: found.document._id,
      level: found.level,
      courseSlug: found.courseSlug,
    }
  );
}

/** A published assessment (ADR 0029) by slug (its block) or public id (its API). */
export const findPublishedAssessment = (match: { publicId: string } | { slug: string }) =>
  findCourseWork<PublishedAssessment>(COLLECTIONS.assessments, PublishedAssessmentSchema, match);

/** A published capstone (ADR 0029) by slug (its block) or public id (its API). */
export const findPublishedCapstone = (match: { publicId: string } | { slug: string }) =>
  findCourseWork<PublishedCapstone>(COLLECTIONS.capstones, PublishedCapstoneSchema, match);

const CourseWorkRowSchema = z.object({
  publicId: PublicIdSchema,
  slug: z.string(),
  title: z.string(),
  passMark: z.number(),
  /** Questions in an assessment; rubric points in a capstone. */
  total: z.number(),
  courseTitle: z.string(),
  courseSlug: z.string(),
  lessonSlug: z.string().nullish(),
});
export type CourseWorkRow = z.infer<typeof CourseWorkRowSchema>;

/**
 * Every published assessment or capstone, with its course and the module page that shows it,
 * in course order: for the Performance page.
 */
export async function findCourseWorkList(
  collection: 'assessments' | 'capstones',
): Promise<CourseWorkRow[]> {
  const rows = await getDb()
    .collection(COLLECTIONS[collection])
    .aggregate([
      { $match: { _status: PUBLISHED } },
      ...withModuleAndCourse('module'),
      {
        $lookup: {
          from: COLLECTIONS.lessons,
          localField: 'module._id',
          foreignField: 'module',
          as: 'lessons',
          pipeline: [{ $match: { _status: PUBLISHED } }, { $sort: { order: 1 } }, { $limit: 1 }],
        },
      },
      { $sort: { 'course.order': 1 } },
      {
        $project: {
          _id: 0,
          publicId: 1,
          slug: 1,
          title: 1,
          passMark: 1,
          total:
            collection === 'assessments'
              ? { $size: { $ifNull: ['$questions', []] } }
              : { $sum: '$rubric.points' },
          courseTitle: '$course.title',
          courseSlug: '$course.slug',
          lessonSlug: { $first: '$lessons.slug' },
        },
      },
    ])
    .toArray();
  return rows.map((row) => CourseWorkRowSchema.parse(row));
}
