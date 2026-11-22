import { type CourseOutline, LEVELS, ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { ComingSoonBadge } from '@/components/shared/coming-soon-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { Card } from '@/components/ui/card';
import { SiteLink } from '@/components/ui/site-link';
import { CourseLevelBadge } from '@/features/courses/components/course-outline';
import { findCourseOutlines } from '@/db/content';
import { PageIntro } from '@/components/shared/page-intro';
import { countOf } from '@/lib/count-of';
import { PAGE_SPACING } from '@/components/shared/page-shell';

export const metadata: Metadata = { title: 'Courses' };

/**
 * One course in the catalogue, the whole card a link. Cards in a row share their height, and
 * the summary is held to three lines, so the row lines up.
 */
function CourseCard({ course }: { course: CourseOutline }) {
  const drills = course.modules.reduce((sum, module) => sum + module.drills.length, 0);
  return (
    <SiteLink href={ROUTES.course(course.slug)} className="group block h-full">
      <Card className="flex h-full flex-col gap-3 transition-colors group-hover:border-foreground">
        <div className="flex items-center justify-between">
          <CourseLevelBadge course={course} />
          <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Level {LEVELS.indexOf(course.level) + 1}
          </span>
        </div>
        <h2 className="text-xl font-bold leading-snug tracking-tight">{course.title}</h2>
        {course.summary && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {course.summary}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-4">
          {course.comingSoon ? (
            <ComingSoonBadge />
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">
              {countOf(course.modules.length, 'module')}
              {drills > 0 && ` · ${countOf(drills, 'Drill')}`}
            </span>
          )}
          <span className="text-sm font-medium group-hover:underline">
            {course.comingSoon ? 'Learn more →' : 'View course →'}
          </span>
        </div>
      </Card>
    </SiteLink>
  );
}

export default async function CoursesPage() {
  const courses = await findCourseOutlines();
  return (
    <div className={`mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 ${PAGE_SPACING}`}>
      <PageIntro eyebrow="Courses" title="Course outlines">
        Three levels, each building on the last. Every open course&apos;s outline is free to read,
        and its Module 1 is free once you sign in. The others say when they are coming.
      </PageIntro>
      {courses.length === 0 ? (
        <EmptyState
          title="Outlines are on their way"
          description="Course outlines appear here as each course is published."
        />
      ) : (
        <ul className="grid gap-6 md:grid-cols-3">
          {courses.map((course) => (
            <li key={course.slug}>
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
