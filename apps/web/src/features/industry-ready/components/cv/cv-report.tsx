'use client';

import type { CvReport, JobMatch } from '@siliconbox/shared';
import { Badge } from '@/components/ui/badge';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { cn } from '@/lib/cn';
import { countOf } from '@/lib/count-of';

function verdict(score: number): { label: string; tone: string } {
  if (score >= 80) return { label: 'Strong', tone: 'text-success' };
  if (score >= 60) return { label: 'Good, with fixes', tone: 'text-foreground' };
  if (score >= 40) return { label: 'Needs work', tone: 'text-warning' };
  return { label: 'Weak', tone: 'text-destructive' };
}

const STATUS = {
  fail: { mark: '✕', label: 'Fix first', tone: 'text-destructive' },
  warn: { mark: '!', label: 'Improve', tone: 'text-warning' },
  pass: { mark: '✓', label: 'Good', tone: 'text-success' },
} as const;

function ScoreBars({ report }: { report: CvReport }) {
  return (
    <ul className="flex flex-col gap-2">
      {report.categories.map((category) => (
        <li
          key={category.id}
          className="grid grid-cols-[160px_1fr_40px] items-center gap-3 text-sm"
        >
          <span>{category.label}</span>
          {/* SVG, not an inline style: the strict CSP forbids style attributes. */}
          <svg
            aria-hidden="true"
            viewBox="0 0 100 6"
            preserveAspectRatio="none"
            className="h-1.5 w-full"
          >
            <rect width="100" height="6" rx="3" className="fill-border" />
            <rect width={category.score} height="6" rx="3" className="fill-foreground" />
          </svg>
          <span className="text-right font-mono text-[12px]">{category.score}</span>
        </li>
      ))}
    </ul>
  );
}

function Checks({ report }: { report: CvReport }) {
  return (['fail', 'warn', 'pass'] as const).map((status) => {
    const checks = report.checks.filter((check) => check.status === status);
    if (checks.length === 0) return null;
    return (
      <section key={status} className="flex flex-col gap-2">
        <h3 className={EYEBROW_CLASS}>{STATUS[status].label}</h3>
        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li key={check.id} className="flex gap-3 text-sm">
              <span aria-hidden="true" className={cn('w-4 font-bold', STATUS[status].tone)}>
                {STATUS[status].mark}
              </span>
              <span>
                <strong className="font-semibold">{check.title}.</strong>{' '}
                <span className="text-muted-foreground">{check.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  });
}

/** Terms found in the CV (filled) and those it lacks (outlined). */
function KeywordChips({ found, missing }: { found: string[]; missing: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {found.map((word) => (
        <Badge key={word} variant="inverted">
          {word}
        </Badge>
      ))}
      {missing.map((word) => (
        <Badge key={word}>{word}</Badge>
      ))}
    </div>
  );
}

function Keywords({ report }: { report: CvReport }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={EYEBROW_CLASS}>Formal verification keywords</h3>
      <KeywordChips found={report.keywords.found} missing={report.keywords.missing} />
      <p className="text-[12px] text-muted-foreground">
        Filled: found in your CV. Outlined: consider adding, only where true for your work.
      </p>
    </section>
  );
}

function JobMatchView({ match }: { match: JobMatch }) {
  const asked = match.found.length + match.missing.length;
  return (
    <section className="flex flex-col gap-2">
      <h3 className={EYEBROW_CLASS}>Match with the job description</h3>
      {asked === 0 ? (
        <p className="text-sm text-muted-foreground">
          That job description names none of the formal verification or hardware terms we know, so
          there is no match to show.
        </p>
      ) : (
        <>
          <p className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold">{match.score}%</span>
            <span className="text-sm text-muted-foreground">
              You show {match.found.length} of the {countOf(asked, 'term')} it asks for; those under
              its requirements count for more.
            </span>
          </p>
          <KeywordChips found={match.found} missing={match.missing} />
          <p className="text-[12px] text-muted-foreground">
            Filled: in your CV. Outlined: the job asks for it; add it only where it is true for your
            work.
          </p>
        </>
      )}
    </section>
  );
}

/** The screening result: score, the job match when one was asked for, areas, fixes, keywords. */
export function CvReportView({ report }: { report: CvReport }) {
  const { label, tone } = verdict(report.score);
  return (
    <article
      aria-label="CV screening report"
      className="flex flex-col gap-6 rounded-card border border-border p-6"
    >
      <header className="flex items-end gap-4">
        <p className="font-mono text-5xl font-bold tracking-tight">{report.score}</p>
        <div className="pb-1">
          <p className={cn('text-lg font-semibold', tone)}>{label}</p>
          <p className="text-[12px] text-muted-foreground">
            {report.words} words{report.pages === null ? '' : ` · ${report.pages} pages`}
          </p>
        </div>
      </header>
      {report.jobMatch !== undefined && <JobMatchView match={report.jobMatch} />}
      <ScoreBars report={report} />
      <Checks report={report} />
      <Keywords report={report} />
    </article>
  );
}
