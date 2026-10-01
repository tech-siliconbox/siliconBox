import { ERRORS, ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LessonBlockRenderer } from '@/components/lesson/lesson-block-renderer';
import { LockedCard } from '@/components/shared/locked-card';
import { buttonVariants } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { findDoneLessonIds } from '@/db/progress';
import { MarkDoneButton } from '@/features/progress/components/mark-done-button';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { AppError } from '@/server/errors';
import { readLesson } from '@/server/lessons';

// Lesson text must never be indexed or cached; the page renders per request (ADR 0007).
export const metadata: Metadata = { title: 'Lesson', robots: { index: false, follow: false } };

type LessonPageProps = { params: Promise<{ lessonId: string }> };

export default async function LessonPage({ params }: LessonPageProps) {
  const { lessonId } = await params;
  const identity = await requirePageIdentity();
  const lesson = await readLesson(identity, lessonId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === 'NOT_FOUND') notFound();
    if (
      error instanceof AppError &&
      (error.code === 'NOT_ENTITLED' || error.code === 'RATE_LIMITED')
    ) {
      return error.code;
    }
    throw error;
  });

  if (typeof lesson === 'string') return <LessonLocked reason={lesson} />;

  const done = (await findDoneLessonIds(identity.userId, [lesson.publicId])).has(lesson.publicId);
  return (
    <article className="mx-auto max-w-2xl px-6 pb-20 pt-16">
      <header className="mb-8 flex flex-col gap-3">
        <Eyebrow>{lesson.preview ? 'Free preview' : 'Lesson'}</Eyebrow>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">{lesson.title}</h1>
        {lesson.durationMinutes && (
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            ~{lesson.durationMinutes} min reading
          </p>
        )}
      </header>
      {lesson.blocks.map((block, index) => (
        <LessonBlockRenderer key={index} block={block} />
      ))}
      <footer className="mt-12 border-t border-border pt-6">
        <MarkDoneButton lessonId={lesson.publicId} initiallyDone={done} />
      </footer>
    </article>
  );
}

/** Why the lesson cannot be shown, with the way forward when there is one. */
function LessonLocked({ reason }: { reason: 'NOT_ENTITLED' | 'RATE_LIMITED' }) {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-16">
      <LockedCard
        title="This lesson is locked"
        reason={ERRORS[reason].message}
        action={
          reason === 'NOT_ENTITLED' ? (
            <Link
              href={ROUTES.pricing}
              className={buttonVariants({ size: 'sm', className: 'w-fit' })}
            >
              See pricing
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
