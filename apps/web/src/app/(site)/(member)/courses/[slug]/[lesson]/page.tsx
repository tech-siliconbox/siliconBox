import type { Metadata } from 'next';
import { LessonBody } from '@/components/lesson/lesson-body';
import { PaidContentLocked } from '@/components/shared/paid-content-locked';
import { CourseIndexLayout } from '@/features/courses/components/course-index-layout';
import { MarkDoneButton } from '@/features/progress/components/mark-done-button';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readCourseIndex } from '@/server/course-index';
import { readLesson } from '@/server/lessons';
import { isLocked, loadPaidContent } from '@/server/paid-page';

// Lesson text must never be indexed or cached; the page renders per request (ADR 0007).
export const metadata: Metadata = { title: 'Lesson', robots: { index: false, follow: false } };

type LessonPageProps = { params: Promise<{ slug: string; lesson: string }> };

export default async function LessonPage({ params }: LessonPageProps) {
  const { slug, lesson: lessonSlug } = await params;
  const identity = await requirePageIdentity();
  const page = await loadPaidContent(() =>
    readLesson(identity, { course: slug, lesson: lessonSlug }),
  );
  if (isLocked(page)) {
    return <PaidContentLocked title="This lesson is locked" reason={page.locked} />;
  }
  const { lesson } = page;
  const index = await readCourseIndex(identity, page);
  return (
    <CourseIndexLayout {...index} currentLessonId={lesson.publicId}>
      <article>
        <LessonBody lesson={lesson} />
        <footer className="mt-12 border-t border-border pt-6">
          <MarkDoneButton
            lessonId={lesson.publicId}
            initiallyDone={index.doneLessonIds.has(lesson.publicId)}
          />
        </footer>
      </article>
    </CourseIndexLayout>
  );
}
