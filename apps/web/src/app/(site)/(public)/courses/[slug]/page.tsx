import { type CourseOutline, ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseHtml } from '@/components/lesson/course-html';
import { ComingSoonBadge } from '@/components/shared/coming-soon-badge';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { SiteLink } from '@/components/ui/site-link';
import { findCourseOutlines, findLessonCourses } from '@/db/content';
import { linkedLessonSlugs, resolveCourseLinks } from '@/server/course-html';
import { optionalPageIdentity } from '@/server/auth/page-identity';
import { findDoneInCourse } from '@/server/progress';
import { CourseLevelBadge, CourseOutlineView } from '@/features/courses/components/course-outline';
import { PAGE_SPACING } from '@/components/shared/page-shell';

type CoursePageProps = { params: Promise<{ slug: string }> };

async function findCourse(slug: string) {
  const [course] = await findCourseOutlines(slug);
  return course ?? notFound();
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  return { title: (await findCourse((await params).slug)).title };
}

/** The course home from the author's own page, in the site's design, linking to the modules. */
async function AuthorCourseHome({ introduction }: { introduction: string }) {
  const lessonCourses = await findLessonCourses(linkedLessonSlugs(introduction));
  return (
    <div className={`mx-auto max-w-4xl px-4 sm:px-6 ${PAGE_SPACING}`}>
      <CourseHtml html={resolveCourseLinks(introduction, lessonCourses)} />
    </div>
  );
}

/** The course's title, level and summary, above its outline (or its coming-soon note). */
function CourseHead({ course }: { course: CourseOutline }) {
  return (
    <header className="flex flex-col gap-4">
      <Eyebrow>Course</Eyebrow>
      <h1 className="text-4xl font-bold leading-[1.06] tracking-tighter sm:text-5xl">
        {course.title}
      </h1>
      <div className="flex flex-wrap gap-2">
        <CourseLevelBadge course={course} />
        {course.comingSoon && <ComingSoonBadge />}
      </div>
      {course.summary && (
        <p className="text-base leading-relaxed text-muted-foreground">{course.summary}</p>
      )}
    </header>
  );
}

/** A course still being written: no outline yet, and where to start meanwhile. */
function ComingSoonCourse({ course }: { course: CourseOutline }) {
  return (
    <div className={`mx-auto flex max-w-4xl flex-col gap-10 px-4 sm:px-6 ${PAGE_SPACING}`}>
      <CourseHead course={course} />
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">This course is coming soon</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          It is being written. Its modules and Drills open here when it is ready, and it can be
          bought then. Until then, start with a course that is open now.
        </p>
        <SiteLink href={ROUTES.courses} className="w-fit text-sm font-medium hover:underline">
          See the open courses →
        </SiteLink>
      </Card>
    </div>
  );
}

export default async function CoursePage({ params }: CoursePageProps) {
  const course = await findCourse((await params).slug);
  if (course.comingSoon) return <ComingSoonCourse course={course} />;
  if (course.introduction) return <AuthorCourseHome introduction={course.introduction} />;
  const identity = await optionalPageIdentity();
  const done = await findDoneInCourse(identity, course);
  return (
    <div className={`mx-auto flex max-w-4xl flex-col gap-10 px-4 sm:px-6 ${PAGE_SPACING}`}>
      <CourseHead course={course} />
      <CourseOutlineView course={course} doneLessonIds={done} />
    </div>
  );
}
