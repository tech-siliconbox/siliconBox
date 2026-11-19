import 'server-only';
import { type RubricItem, capstoneAnchor, rubricTotal } from '@siliconbox/shared';
import { Eyebrow } from '@/components/ui/eyebrow';
import type { Submission } from '@/db/capstone-submissions';
import { CapstoneUpload } from '@/features/assessments/components/capstone-upload';
import { formatDate } from '@/lib/format-date';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { type CapstoneView, readCapstoneView } from '@/server/capstones';
import { InlineCourseHtml } from './course-html';

const CELL = 'border-b border-border px-3 py-2 text-left align-top';

/** The rubric, with the expert's score for each criterion once graded. */
function Rubric({ rubric, scores }: { rubric: RubricItem[]; scores: number[] | null }) {
  return (
    <div className="table-frame">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={CELL}>Criterion</th>
            <th className={CELL}>{scores === null ? 'Points' : 'Score'}</th>
            <th className={CELL}>What earns full marks</th>
          </tr>
        </thead>
        <tbody>
          {rubric.map((item, index) => (
            <tr key={item.criterion}>
              <td className={CELL}>{item.criterion}</td>
              <td className={`${CELL} whitespace-nowrap font-mono`}>
                {scores === null ? item.points : `${scores[index] ?? 0} / ${item.points}`}
              </td>
              <td className={CELL}>
                {item.fullMarks && <InlineCourseHtml html={item.fullMarks} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The latest submission's state: waiting, or graded with the expert's feedback. */
function Status({ latest, outOf }: { latest: Submission; outOf: number }) {
  const sent = `${latest.fileName}, sent ${formatDate(latest.submittedAt)}`;
  if (latest.grade === null) {
    return <p>Submitted: {sent}. An expert is reviewing it; you can replace it until then.</p>;
  }
  const { total, passed, feedback } = latest.grade;
  return (
    <div className="flex flex-col gap-2">
      <p className={passed ? 'font-medium text-ok' : 'font-medium text-danger'}>
        {passed ? 'Passed' : 'Not passed yet'}: {total} of {outOf} ({sent}).
      </p>
      <p className="font-medium">Feedback from our expert</p>
      <p className="whitespace-pre-line text-muted-foreground">{feedback}</p>
    </div>
  );
}

function uploadLabel({ submissions }: CapstoneView): string {
  const latest = submissions[0];
  if (latest === undefined) return 'Submit your project';
  return latest.grade === null ? 'Replace your submission' : 'Submit a new version';
}

/**
 * A capstone project inside a module's page (ADR 0029): its rubric, the upload, and the
 * expert's scores and feedback once graded.
 */
export async function CapstoneEmbed({ slug }: { slug: string }) {
  const view = await readCapstoneView(await requirePageIdentity(), slug);
  if (view === null) return null;
  const { capstone, submissions, passed } = view;
  const latest = submissions[0];
  const outOf = rubricTotal(capstone.rubric);
  return (
    <section
      id={capstoneAnchor(slug)}
      aria-label={`Capstone: ${capstone.title}`}
      className="my-8 scroll-mt-20 overflow-hidden rounded-card border border-border bg-background"
    >
      <header className="flex flex-col gap-1 border-b border-border px-4 py-4 sm:px-6">
        <Eyebrow>Capstone project · graded by our experts</Eyebrow>
        <h3 className="text-xl font-bold tracking-tight">{capstone.title}</h3>
        <p className="text-sm text-muted-foreground">
          Scored out of {outOf}. Pass with {capstone.passMark}.
        </p>
      </header>
      <div className="flex flex-col gap-5 px-4 py-5 text-sm sm:px-6">
        <Rubric rubric={capstone.rubric} scores={latest?.grade?.scores ?? null} />
        {latest !== undefined && <Status latest={latest} outOf={outOf} />}
        {!passed && (
          <CapstoneUpload
            capstoneId={capstone.publicId}
            label={uploadLabel(view)}
            anchor={capstoneAnchor(slug)}
          />
        )}
      </div>
    </section>
  );
}
