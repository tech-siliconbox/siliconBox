import { PublicIdSchema, ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { findSubmissionForReview } from '@/db/capstone-submissions';
import { findPublishedCapstone } from '@/db/content';
import { AdminToolHeader } from '@/features/admin-tools/components/admin-tool-header';
import { CapstoneGradeForm } from '@/features/admin-tools/components/capstone-grade-form';
import { formatDate } from '@/lib/format-date';
import { gradeCapstoneAction } from '@/server/capstone-grade-action';
import { expertSession } from '@/server/capstone-reviews';
import { PAGE_SPACING } from '@/components/shared/page-shell';

export const metadata: Metadata = {
  title: 'Grade a capstone',
  robots: { index: false, follow: false },
};

type ReviewPageProps = { params: Promise<{ submission: string }> };

/** One submission: who sent it, the file, and the grading form. Editors and the Owner only. */
export default async function CapstoneReviewPage({ params }: ReviewPageProps) {
  if ((await expertSession()) === null) notFound();
  const id = PublicIdSchema.safeParse((await params).submission);
  const submission = id.success ? await findSubmissionForReview(id.data) : null;
  const capstone = submission && (await findPublishedCapstone({ publicId: submission.capstoneId }));
  if (!submission || !capstone) notFound();
  return (
    <section className={`mx-auto flex max-w-3xl flex-col gap-6 px-6 ${PAGE_SPACING}`}>
      <AdminToolHeader title={`Grade: ${capstone.work.title}`}>
        {submission.learnerName ?? 'Deleted account'} ({submission.learnerEmail ?? 'no email'}) sent{' '}
        {submission.fileName} on {formatDate(submission.submittedAt)}. The learner sees your scores
        and feedback in their course and on Performance.
      </AdminToolHeader>
      {/* A file download, not a page: a plain link, never prefetched. */}
      <a
        href={ROUTES.capstoneFile(submission.publicId)}
        download
        className="self-start text-sm underline underline-offset-4"
      >
        Download the project (.zip)
      </a>
      <CapstoneGradeForm
        action={gradeCapstoneAction}
        submission={submission.publicId}
        rubric={capstone.work.rubric}
        grade={submission.grade}
        passMark={capstone.work.passMark}
      />
    </section>
  );
}
