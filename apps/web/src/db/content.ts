import 'server-only';
import {
  type CourseOutline,
  CourseOutlineSchema,
  type Level,
  LevelSchema,
  type PublishedLesson,
  PublishedLessonSchema,
} from '@siliconbox/shared';
import type { Document } from 'mongodb';
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

export async function findPublishedLesson(
  publicId: string,
): Promise<{ lesson: PublishedLesson; level: Level } | null> {
  const [found] = await getDb()
    .collection(COLLECTIONS.lessons)
    .aggregate([
      { $match: { publicId, _status: PUBLISHED } },
      { $limit: 1 },
      ...withModuleAndCourse('module'),
      { $project: { _id: 0, lesson: '$$ROOT', level: '$course.level' } },
    ])
    .toArray();
  if (found === undefined) return null;
  return {
    lesson: PublishedLessonSchema.parse(found.lesson),
    level: LevelSchema.parse(found.level),
  };
}

/** Published courses with module and lesson titles only. Never lesson text. */
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
            {
              $lookup: {
                from: COLLECTIONS.lessons,
                localField: '_id',
                foreignField: 'module',
                as: 'lessons',
                pipeline: [
                  { $match: { _status: PUBLISHED } },
                  { $sort: { order: 1 } },
                  { $project: { _id: 0, publicId: 1, title: 1, preview: 1, durationMinutes: 1 } },
                ],
              },
            },
            { $project: { _id: 0, title: 1, summary: 1, lessons: 1 } },
          ],
        },
      },
      { $project: { _id: 0, slug: 1, title: 1, level: 1, summary: 1, modules: 1 } },
    ])
    .toArray();
  return documents.map((document) => CourseOutlineSchema.parse(document));
}
