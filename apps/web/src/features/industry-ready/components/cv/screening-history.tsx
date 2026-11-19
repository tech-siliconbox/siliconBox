'use client';

import { API_ROUTES, CV_FILES_KEPT, type CvScreening } from '@siliconbox/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { formatDate } from '@/lib/format-date';

type ScreeningHistoryProps = {
  screenings: CvScreening[];
  onView: (screening: CvScreening) => void;
  onDelete: (publicId: string) => void;
  onDeleteAll: () => void;
};

type RowProps = Pick<ScreeningHistoryProps, 'onView' | 'onDelete'> & { screening: CvScreening };

function ScreeningRow({ screening, onView, onDelete }: RowProps) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="w-10 font-mono font-bold">{screening.report.score}</span>
      <span className="flex-1 truncate">{screening.fileName}</span>
      <span className="font-mono text-[11px] text-muted-foreground">
        {formatDate(screening.createdAt)}
      </span>
      <Button size="sm" variant="secondary" onClick={() => onView(screening)}>
        View
      </Button>
      {screening.file !== undefined && (
        <a
          href={API_ROUTES.cvScreeningFile(screening.publicId)}
          aria-label={`Download ${screening.fileName}`}
          className={buttonVariants({ size: 'sm', variant: 'secondary' })}
        >
          File
        </a>
      )}
      <Button
        size="sm"
        variant="secondary"
        aria-label={`Delete report for ${screening.fileName}`}
        onClick={() => onDelete(screening.publicId)}
      >
        Delete
      </Button>
    </li>
  );
}

/** Past reports, newest first, each deletable; the newest files can be downloaded. */
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
          <ScreeningRow
            key={screening.publicId}
            screening={screening}
            onView={onView}
            onDelete={onDelete}
          />
        ))}
      </ul>
      <p className="text-[12px] text-muted-foreground">
        We keep these reports, and the files of your last {CV_FILES_KEPT} CVs, until you delete
        them. Deleting a report deletes its file.
      </p>
    </section>
  );
}
