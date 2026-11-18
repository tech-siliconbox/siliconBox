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

type Published = { document: Document; level: Level };

/** A published document by public id (or slug), with the level of the course it belongs to. */
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
      { $project: { _id: 0, document: '$$ROOT', level: '$course.level' } },
    ])
    .toArray();
  if (found === undefined) return null;
  return { document: found.document as Document, level: LevelSchema.parse(found.level) };
}

export type PublishedLessonWithLevel = { lesson: PublishedLesson; level: Level };

export async function findPublishedLesson(
  publicId: string,
): Promise<PublishedLessonWithLevel | null> {
  const found = await findPublishedWithLevel(COLLECTIONS.lessons, { publicId });
  return found && { lesson: PublishedLessonSchema.parse(found.document), level: found.level };
}

/** Public ids of published lessons by slug, for links between course pages. */
export async function findLessonPublicIds(slugs: string[]): Promise<Map<string, string>> {
  if (slugs.length === 0) return new Map();
  const lessons = await getDb()
    .collection(COLLECTIONS.lessons)
    .find(
      { slug: { $in: [...new Set(slugs)] }, _status: PUBLISHED },
      { projection: { _id: 0, slug: 1, publicId: 1 } },
    )
    .toArray();
  return new Map(lessons.map((lesson) => [String(lesson.slug), String(lesson.publicId)]));
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

/** A published Drill as the learner sees it, with its level. Never its private part. */
/** A published Drill by public id, or by slug when a lesson embeds it. */
export async function findPublishedDrill(
  match: { publicId: string } | { slug: string },
): Promise<{ drill: PublishedDrill; level: Level } | null> {
  const found = await findPublishedWithLevel(COLLECTIONS.drills, match);
  return found && { drill: PublishedDrillSchema.parse(found.document), level: found.level };
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
              title: 1,
              preview: 1,
              durationMinutes: 1,
            }),
            publishedChildren(COLLECTIONS.drills, 'drills', { publicId: 1, title: 1 }),
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
