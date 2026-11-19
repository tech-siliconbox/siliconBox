import { ROUTES } from './routes';
import type { CourseOutline } from './schemas/lesson';

type Link = { title: string; href: string };

/** Each lesson and Drill of the courses, by public id: its title and page address. */
export function outlineLinks(courses: readonly CourseOutline[]) {
  const lessons = new Map<string, Link>();
  const drills = new Map<string, Link>();
  for (const course of courses) {
    for (const courseModule of course.modules) {
      for (const lesson of courseModule.lessons) {
        const href = ROUTES.lesson(course.slug, lesson.slug);
        lessons.set(lesson.publicId, { title: lesson.title, href });
      }
      for (const drill of courseModule.drills) {
        drills.set(drill.publicId, {
          title: drill.title,
          href: ROUTES.drill(course.slug, drill.slug),
        });
      }
    }
  }
  return { lessons, drills };
}
