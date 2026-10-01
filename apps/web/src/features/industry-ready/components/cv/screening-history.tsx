'use client';

import type { CvScreening } from '@siliconbox/shared';
import { Button } from '@/components/ui/button';

type ScreeningHistoryProps = {
  screenings: CvScreening[];
  onView: (screening: CvScreening) => void;
  onDelete: (publicId: string) => void;
  onDeleteAll: () => void;
};

/** Past reports, newest first, each deletable; files were never kept. */
export function ScreeningHistory({
  screenings,
  onView,
  onDelete,
  onDeleteAll,
}: ScreeningHistoryProps) {
  if (screenings.length === 0) return null;
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="history-heading" className="text-base font-bold tracking-tight">
          Your reports
        </h2>
        <Button size="sm" variant="secondary" onClick={onDeleteAll}>
          Delete all
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-card border border-border">
        {screenings.map((screening) => (
          <li key={screening.publicId} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="w-10 font-mono font-bold">{screening.report.score}</span>
            <span className="flex-1 truncate">{screening.fileName}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {screening.createdAt.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <Button size="sm" variant="secondary" onClick={() => onView(screening)}>
              View
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Delete report for ${screening.fileName}`}
              onClick={() => onDelete(screening.publicId)}
            >
              Delete
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground">
        We keep only these reports, never your file. Delete them at any time.
      </p>
    </section>
  );
}
