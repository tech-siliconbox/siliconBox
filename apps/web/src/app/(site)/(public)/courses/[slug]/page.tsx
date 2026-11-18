import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseHtml } from '@/components/lesson/course-html';
import { Eyebrow } from '@/components/ui/eyebrow';
import { findCourseOutlines, findLessonPublicIds } from '@/db/content';
import { linkedLessonSlugs, resolveCourseLinks } from '@/server/course-html';
import { findDoneLessonIds } from '@/db/progress';
import { optionalPageIdentity } from '@/server/auth/page-identity';
import { CourseLevelBadge, CourseOutlineView } from '@/features/courses/components/course-outline';

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
  const lessonIds = await findLessonPublicIds(linkedLessonSlugs(introduction));
  return (
    <div className="mx-auto max-w-4xl px-6 pb-20 pt-24">
      <CourseHtml html={resolveCourseLinks(introduction, lessonIds)} />
    </div>
  );
}

export default async function CoursePage({ params }: CoursePageProps) {
  const course = await findCourse((await params).slug);
  if (course.introduction) return <AuthorCourseHome introduction={course.introduction} />;
  const identity = await optionalPageIdentity();
  const lessonIds = course.modules.flatMap((module) =>
    module.lessons.map((lesson) => lesson.publicId),
  );
  const done =
    identity === null ? new Set<string>() : await findDoneLessonIds(identity.userId, lessonIds);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pb-20 pt-24">
      <header className="flex flex-col gap-4">
        <Eyebrow>Course</Eyebrow>
        <h1 className="text-5xl font-bold leading-[1.06] tracking-tighter">{course.title}</h1>
        <CourseLevelBadge course={course} />
        {course.summary && (
          <p className="text-base leading-relaxed text-muted-foreground">{course.summary}</p>
        )}
      </header>
      <CourseOutlineView course={course} doneLessonIds={done} />
    </div>
  );
}
