import { ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyState } from '@/components/shared/empty-state';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { findCourseOutlines } from '@/db/content';
import { CourseLevelBadge } from '@/features/courses/components/course-outline';

export const metadata: Metadata = { title: 'Courses' };

export default async function CoursesPage() {
  const courses = await findCourseOutlines();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pb-20 pt-24">
      <header className="flex flex-col gap-4">
        <Eyebrow>Courses</Eyebrow>
        <h1 className="text-5xl font-bold leading-[1.06] tracking-tighter">Course outlines</h1>
      </header>
      {courses.length === 0 ? (
        <EmptyState
          title="Outlines are on their way"
          description="Course outlines appear here as each course is published."
        />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2">
          {courses.map((course) => (
            <li key={course.slug}>
              <Link href={ROUTES.course(course.slug)} className="block h-full">
                <Card className="flex h-full flex-col gap-3 transition-colors hover:border-foreground">
                  <CourseLevelBadge course={course} />
                  <h2 className="text-xl font-bold tracking-tight">{course.title}</h2>
                  {course.summary && (
                    <p className="text-sm text-muted-foreground">{course.summary}</p>
                  )}
                  <p className="mt-auto font-mono text-[11px] text-muted-foreground">
                    {course.modules.length} modules
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
