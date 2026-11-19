import type { Metadata } from 'next';
import { TextBody } from '@/components/lesson/prose';
import { REVEAL_SUMMARY } from '@/components/lesson/reveal-summary';
import { EmptyState } from '@/components/shared/empty-state';
import { PageIntro } from '@/components/shared/page-intro';
import { findPublishedFaqs } from '@/db/faqs';
import { DashboardFrame } from '@/features/dashboard/components/dashboard-frame';
import { optionalPageIdentity } from '@/server/auth/page-identity';
import { getConfig } from '@/server/config';
import { PAGE_SPACING } from '@/components/shared/page-shell';

export const metadata: Metadata = { title: 'Help' };

/** Public, so it helps before sign-in too; a signed-in learner keeps their own pages' sidebar. */
export default async function HelpPage() {
  const [faqs, identity] = await Promise.all([findPublishedFaqs(), optionalPageIdentity()]);
  // The support inbox comes from the host's settings, never from the repository.
  const contact = getConfig().EMAIL_REPLY_TO;
  const help = (
    <div className="flex flex-col gap-6">
      <PageIntro eyebrow="Help" title="Questions and answers">
        How SiliconBox works: access, Drills, your account.
        {contact && (
          <>
            {' '}
            Still stuck? Write to{' '}
            <a href={`mailto:${contact}`} className="text-foreground underline underline-offset-4">
              {contact}
            </a>
            .
          </>
        )}
      </PageIntro>
      {faqs.length === 0 ? (
        <EmptyState title="Answers are on their way" description="Questions appear here soon." />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-card border border-border">
          {faqs.map(({ question, answer }) => (
            <details key={question} className="group px-5 py-2">
              <summary className={`${REVEAL_SUMMARY} text-[15px]`}>{question}</summary>
              <div className="mt-3 text-sm leading-relaxed text-muted-foreground">
                <TextBody text={answer} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
  if (identity) return <DashboardFrame>{help}</DashboardFrame>;
  return <div className={`mx-auto max-w-3xl px-4 sm:px-6 ${PAGE_SPACING}`}>{help}</div>;
}
