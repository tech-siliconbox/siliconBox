import type { CourseOutline } from '@siliconbox/shared';

type OutlineModule = CourseOutline['modules'][number];

/** A module is done when every one of its lessons is. */
export const isModuleDone = (module: OutlineModule, done: ReadonlySet<string>): boolean =>
  module.lessons.length > 0 && module.lessons.every((lesson) => done.has(lesson.publicId));

/** The module's reading time: its lessons' times added up. */
export const moduleMinutes = (module: OutlineModule): number =>
  module.lessons.reduce((sum, lesson) => sum + (lesson.durationMinutes ?? 0), 0);

/** Modules that have lessons, numbered by their place in the course, with their first lesson. */
export const readableModules = (course: CourseOutline) =>
  course.modules.flatMap((module, index) => {
    const [first] = module.lessons;
    return first === undefined ? [] : [{ module, number: index + 1, first }];
  });
