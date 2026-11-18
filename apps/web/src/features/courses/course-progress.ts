import type { CourseOutline } from '@siliconbox/shared';

type OutlineModule = CourseOutline['modules'][number];

/** A module is done when every one of its lessons is. */
export const isModuleDone = (module: OutlineModule, done: ReadonlySet<string>): boolean =>
  module.lessons.length > 0 && module.lessons.every((lesson) => done.has(lesson.publicId));

/** The module's reading time: its lessons' times added up. */
export const moduleMinutes = (module: OutlineModule): number =>
  module.lessons.reduce((sum, lesson) => sum + (lesson.durationMinutes ?? 0), 0);

/** How many of the course's modules (those with lessons) are done. */
export function modulesDone(course: CourseOutline, done: ReadonlySet<string>) {
  const modules = readableModules(course);
  return {
    done: modules.filter(({ module }) => isModuleDone(module, done)).length,
    total: modules.length,
  };
}

/** Modules that have lessons, numbered by their place in the course, with their first lesson. */
export const readableModules = (course: CourseOutline) =>
  course.modules.flatMap((module, index) => {
    const [first] = module.lessons;
    return first === undefined ? [] : [{ module, number: index + 1, first }];
  });

type OutlineLesson = OutlineModule['lessons'][number];

/** The first lesson not done that the learner may open, with its module's number and title. */
export function nextLesson(
  course: CourseOutline,
  done: ReadonlySet<string>,
  canOpen: (lesson: OutlineLesson) => boolean,
) {
  for (const { module, number } of readableModules(course)) {
    const lesson = module.lessons.find(
      (candidate) => !done.has(candidate.publicId) && canOpen(candidate),
    );
    if (lesson !== undefined) return { lesson, number, moduleTitle: module.title };
  }
  return null;
}
