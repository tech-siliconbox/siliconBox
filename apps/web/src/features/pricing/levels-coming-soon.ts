import type { CourseOutline, Level } from '@siliconbox/shared';

/**
 * The levels shown as coming soon on pricing, and not sold yet: those with a course, every one
 * of them still being written. A level with an open course is sold.
 */
export function levelsComingSoon(
  courses: readonly Pick<CourseOutline, 'level' | 'comingSoon'>[],
): ReadonlySet<Level> {
  const open = new Set(courses.filter((course) => !course.comingSoon).map((c) => c.level));
  return new Set(courses.map((course) => course.level).filter((level) => !open.has(level)));
}
