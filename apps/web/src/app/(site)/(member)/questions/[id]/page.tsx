import { ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LessonBlockRenderer } from '@/components/lesson/lesson-block-renderer';
import { PaidContentLocked } from '@/components/shared/paid-content-locked';
import { Eyebrow } from '@/components/ui/eyebrow';
import { readAnswer } from '@/server/answers';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { isLocked, loadPaidContent } from '@/server/paid-page';

// A paid answer: never indexed or cached, rendered per request after the entitlement check.
export const metadata: Metadata = { title: 'Answer', robots: { index: false, follow: false } };

type AnswerPageProps = { params: Promise<{ id: string }> };

export default async function AnswerPage({ params }: AnswerPageProps) {
  const { id } = await params;
  const identity = await requirePageIdentity();
  const answer = await loadPaidContent(() => readAnswer(identity, id));
  if (isLocked(answer))
    return <PaidContentLocked title="This answer is locked" reason={answer.locked} />;

  return (
    <article className="mx-auto max-w-2xl px-6 pb-20 pt-16">
      <header className="mb-8 flex flex-col gap-3">
        <Eyebrow>Interview question</Eyebrow>
        <h1 className="whitespace-pre-line text-2xl font-bold leading-snug tracking-tight">
          {answer.question}
        </h1>
      </header>
      <Eyebrow className="mb-4">Answer</Eyebrow>
      {answer.blocks.map((block, index) => (
        <LessonBlockRenderer key={index} block={block} />
      ))}
      <footer className="mt-12 border-t border-border pt-6">
        <Link href={ROUTES.questions} className="text-sm text-link-idle hover:text-link-hover">
          ← All questions
        </Link>
      </footer>
    </article>
  );
}
