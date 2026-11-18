import { QuestionQuerySchema } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/shared/empty-state';
import { findPublishedQuestions } from '@/db/questions';
import { QuestionCard } from '@/features/questions/components/question-card';
import { QuestionSearch } from '@/features/questions/components/question-search';
import { questionsHref } from '@/features/questions/questions-href';
import { SiteLink } from '@/components/ui/site-link';
import { PageIntro } from '@/components/shared/page-intro';

export const metadata: Metadata = { title: 'Interview questions' };

type QuestionsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function QuestionsPage({ searchParams }: QuestionsPageProps) {
  // Unknown or malformed filters fall back to the unfiltered first page.
  const parsed = QuestionQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : QuestionQuerySchema.parse({});
  const { questions, total, page, pageCount } = await findPublishedQuestions(query);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 pb-20 pt-24">
      <PageIntro eyebrow="Question bank" title="Interview questions">
        Questions companies have asked. Answers are open to learners with active access.
      </PageIntro>
      <QuestionSearch query={query} />
      {questions.length === 0 ? (
        <EmptyState
          title="No questions found"
          description="Try another search, or clear the filters."
        />
      ) : (
        <>
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {total} questions
          </p>
          <div className="flex flex-col gap-4">
            {questions.map((question) => (
              <QuestionCard key={question.slug} question={question} />
            ))}
          </div>
          <nav aria-label="Pages" className="flex justify-between text-sm">
            {page > 1 ? (
              <SiteLink href={questionsHref({ ...query, page: page - 1 })}>← Previous</SiteLink>
            ) : (
              <span />
            )}
            {page < pageCount && (
              <SiteLink href={questionsHref({ ...query, page: page + 1 })}>Next →</SiteLink>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
