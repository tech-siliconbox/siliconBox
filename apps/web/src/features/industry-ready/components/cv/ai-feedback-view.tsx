import type { CvFeedback, StoredCvFeedback } from '@siliconbox/shared';
import { Badge } from '@/components/ui/badge';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { formatDate } from '@/lib/format-date';

const IMPACT_LABEL = { high: 'Fix first', medium: 'Worth doing', low: 'Polish' } as const;

function Suggestions({ items }: { items: CvFeedback['suggestions'] }) {
  return (
    <ol className="flex flex-col gap-4">
      {items.map((item, index) => (
        <li key={index} className="flex flex-col gap-1.5 text-sm">
          <p className="flex items-baseline gap-2">
            <Badge variant={item.impact === 'high' ? 'inverted' : 'outline'}>
              {IMPACT_LABEL[item.impact]}
            </Badge>
            <span>{item.issue}</span>
          </p>
          {item.passage !== null && (
            <p className="border-l-2 border-border pl-3 text-muted-foreground">
              Your line: {item.passage}
            </p>
          )}
          {item.rewrite !== null && (
            <p className="border-l-2 border-foreground pl-3">Try: {item.rewrite}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function Points({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className={EYEBROW_CLASS}>{title}</h3>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function JobFit({ fit }: { fit: NonNullable<CvFeedback['jobFit']> }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={EYEBROW_CLASS}>Fit for the job</h3>
      <p className="text-sm">{fit.verdict}</p>
      {fit.gaps.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {fit.gaps.map((gap) => (
            <li key={gap.need}>
              <strong className="font-semibold">{gap.need}.</strong>{' '}
              <span className="text-muted-foreground">{gap.advice}</span>
            </li>
          ))}
        </ul>
      )}
      <Points title="Where you meet it" items={fit.strengths} />
    </section>
  );
}

/** AI feedback as plain text: summary, suggestions beside the lines they rewrite, strengths, fit. */
export function AiFeedbackView({ feedback }: { feedback: StoredCvFeedback }) {
  const { review } = feedback;
  return (
    <article aria-label="AI feedback" className="flex flex-col gap-5">
      <p className="text-sm">{review.summary}</p>
      {review.suggestions.length > 0 && <Suggestions items={review.suggestions} />}
      <Points title="Strengths" items={review.strengths} />
      {review.jobFit !== null && <JobFit fit={review.jobFit} />}
      <p className="text-[12px] text-muted-foreground">
        Written by Claude (Anthropic) on {formatDate(feedback.createdAt)}, from what your CV says
        only. Check each suggestion before you use it. Your score comes from our rules, not from AI.
      </p>
    </article>
  );
}
