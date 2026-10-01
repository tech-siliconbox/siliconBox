'use client';

import type { CvScreening } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCvScreenings } from '../../hooks/use-cv-screenings';
import { CvReportView } from './cv-report';
import { DropZone } from './drop-zone';
import { ScreeningHistory } from './screening-history';

/** Upload, screen, read the report; past reports stay until the learner deletes them. */
export function CvScreener({ initial }: { initial: CvScreening[] }) {
  const [file, setFile] = useState<File | null>(null);
  const { pending, error, history, shown, setShown, screen, remove } = useCvScreenings(initial);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <DropZone file={file} onFile={setFile} disabled={pending} />
        <Button
          size="lg"
          className="w-fit self-center"
          disabled={file === null || pending}
          onClick={() => file !== null && void screen(file)}
        >
          {pending ? 'Screening…' : 'Screen my CV'}
        </Button>
        {error !== null && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {shown !== null && <CvReportView report={shown.report} />}
      <ScreeningHistory
        screenings={history}
        onView={setShown}
        onDelete={(id) => void remove(id)}
        onDeleteAll={() => void remove()}
      />
    </div>
  );
}
