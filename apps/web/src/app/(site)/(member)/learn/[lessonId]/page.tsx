import type { Metadata } from 'next';
import { LessonBody } from '@/components/lesson/lesson-body';
import { PaidContentLocked } from '@/components/shared/paid-content-locked';
import { findDoneLessonIds } from '@/db/progress';
import { MarkDoneButton } from '@/features/progress/components/mark-done-button';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readLesson } from '@/server/lessons';
import { isLocked, loadPaidContent } from '@/server/paid-page';

// Lesson text must never be indexed or cached; the page renders per request (ADR 0007).
export const metadata: Metadata = { title: 'Lesson', robots: { index: false, follow: false } };

type LessonPageProps = { params: Promise<{ lessonId: string }> };

export default async function LessonPage({ params }: LessonPageProps) {
  const { lessonId } = await params;
  const identity = await requirePageIdentity();
  const lesson = await loadPaidContent(() => readLesson(identity, lessonId));
  if (isLocked(lesson)) {
    return <PaidContentLocked title="This lesson is locked" reason={lesson.locked} />;
  }
  const done = (await findDoneLessonIds(identity.userId, [lesson.publicId])).has(lesson.publicId);
  return (
    <article className="mx-auto max-w-2xl px-6 pb-20 pt-16">
      <LessonBody lesson={lesson} />
      <footer className="mt-12 border-t border-border pt-6">
        <MarkDoneButton lessonId={lesson.publicId} initiallyDone={done} />
      </footer>
    </article>
  );
}
