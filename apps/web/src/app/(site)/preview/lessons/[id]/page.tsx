import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LessonBlockRenderer } from '@/components/lesson/lesson-block-renderer';
import { Watermarked } from '@/components/shared/watermarked';
import { Eyebrow } from '@/components/ui/eyebrow';
import { readLessonPreview } from '@/server/preview';

export const metadata: Metadata = {
  title: 'Lesson preview',
  robots: { index: false, follow: false },
};

type PreviewPageProps = { params: Promise<{ id: string }> };

/** An admin's view of a lesson's latest draft, rendered exactly as learners will see it. */
export default async function LessonPreviewPage({ params }: PreviewPageProps) {
  const preview = await readLessonPreview((await params).id);
  if (preview === null) notFound();
  const { lesson, adminEmail } = preview;
  const mark = `PREVIEW · ${adminEmail} · ${new Date().toISOString().slice(0, 10)}`;

  return (
    <>
      <p
        role="status"
        className="bg-foreground px-6 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-background"
      >
        Preview of the latest draft · learners see only the published version
      </p>
      <Watermarked mark={mark}>
        <article className="mx-auto max-w-2xl px-6 pb-20 pt-16">
          <header className="mb-8 flex flex-col gap-3">
            <Eyebrow>{lesson.preview ? 'Free preview' : 'Lesson'}</Eyebrow>
            <h1 className="text-4xl font-bold leading-tight tracking-tight">{lesson.title}</h1>
          </header>
          {lesson.blocks.map((block, index) => (
            <LessonBlockRenderer key={index} block={block} />
          ))}
        </article>
      </Watermarked>
    </>
  );
}
