import { ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SiteLink } from '@/components/ui/site-link';
import { type SubmissionForReview, listSubmissionsForReview } from '@/db/capstone-submissions';
import { findCourseWorkList } from '@/db/content';
import { AdminToolHeader } from '@/features/admin-tools/components/admin-tool-header';
import { formatDate } from '@/lib/format-date';
import { expertSession } from '@/server/capstone-reviews';
import { PAGE_SPACING } from '@/components/shared/page-shell';

export const metadata: Metadata = {
  title: 'Capstone reviews',
  robots: { index: false, follow: false },
};

const CELL = 'border-b border-border px-3 py-2 text-left';

type ReviewTableProps = {
  submissions: SubmissionForReview[];
  titles: ReadonlyMap<string, string>;
};

function ReviewTable({ submissions, titles }: ReviewTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          {['Learner', 'Capstone', 'Sent', 'Status', ''].map((heading) => (
            <th key={heading} className={CELL}>
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {submissions.map((submission) => (
          <tr key={submission.publicId}>
            <td className={CELL}>{submission.learnerEmail ?? 'Deleted account'}</td>
            <td className={CELL}>{titles.get(submission.capstoneId) ?? 'Unpublished capstone'}</td>
            <td className={CELL}>{formatDate(submission.submittedAt)}</td>
            <td className={CELL}>
              {submission.grade === null
                ? 'Waiting'
                : `${submission.grade.total} · ${submission.grade.passed ? 'passed' : 'not passed'}`}
            </td>
            <td className={CELL}>
              <SiteLink
                href={ROUTES.capstoneReview(submission.publicId)}
                className="underline underline-offset-4"
              >
                {submission.grade === null ? 'Review' : 'Open'}
              </SiteLink>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Editors and the Owner only; anyone else gets "not found". */
export default async function CapstoneReviewsPage() {
  if ((await expertSession()) === null) notFound();
  const [submissions, capstones] = await Promise.all([
    listSubmissionsForReview(),
    findCourseWorkList('capstones'),
  ]);
  const titles = new Map(capstones.map((c) => [c.publicId, `${c.courseTitle}: ${c.title}`]));
  return (
    <section className={`mx-auto flex max-w-5xl flex-col gap-6 px-6 ${PAGE_SPACING}`}>
      <AdminToolHeader title="Capstone reviews">
        Projects waiting for review come first, oldest first. Open one to download it, score each
        rubric criterion and write feedback for the learner.
      </AdminToolHeader>
      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No submissions yet.</p>
      ) : (
        <ReviewTable submissions={submissions} titles={titles} />
      )}
    </section>
  );
}
