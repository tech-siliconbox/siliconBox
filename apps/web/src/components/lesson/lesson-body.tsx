import 'server-only';
import type { PublishedLesson } from '@siliconbox/shared';
import { ProtectedContent } from '@/components/shared/protected-content';
import { Eyebrow } from '@/components/ui/eyebrow';
import { formatDuration } from '@/lib/format-duration';
import { LessonBlockRenderer } from './lesson-block-renderer';

/** The site's heading, for lessons without an author's page that carries its own. */
function LessonHeader({ lesson }: { lesson: PublishedLesson }) {
  return (
    <header className="mb-8 flex flex-col gap-3">
      <Eyebrow>{lesson.preview ? 'Free preview' : 'Lesson'}</Eyebrow>
      <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        {lesson.title}
      </h1>
      {lesson.durationMinutes && (
        <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          ~{formatDuration(lesson.durationMinutes)} reading
        </p>
      )}
    </header>
  );
}

/**
 * A lesson's content, protected (ADR 0023). An author's page (`html` blocks, ADR 0024) opens
 * with its own module tag, heading and lead, so it gets no site heading.
 */
export function LessonBody({ lesson }: { lesson: PublishedLesson }) {
  const authorPage = lesson.blocks.some((block) => block.blockType === 'html');
  return (
    <>
      {!authorPage && <LessonHeader lesson={lesson} />}
      <ProtectedContent>
        {lesson.blocks.map((block, index) => (
          <LessonBlockRenderer key={index} block={block} />
        ))}
      </ProtectedContent>
    </>
  );
}
