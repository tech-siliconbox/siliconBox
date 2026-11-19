'use client';

import type { CvScreening } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCvScreenings } from '../../hooks/use-cv-screenings';
import { AtsText } from './ats-text';
import { CvReportView } from './cv-report';
import { DropZone } from './drop-zone';
import { JobDescriptionField } from './job-description-field';
import { ScreeningHistory } from './screening-history';

/** Upload, screen (optionally against a job), read the report; past reports stay until deleted. */
export function CvScreener({ initial }: { initial: CvScreening[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const { pending, error, history, shown, view, screen, remove } = useCvScreenings(initial);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <DropZone file={file} onFile={setFile} disabled={pending} />
        <JobDescriptionField
          value={jobDescription}
          onChange={setJobDescription}
          disabled={pending}
        />
        <Button
          size="lg"
          className="w-fit self-center"
          disabled={file === null || pending}
          onClick={() => file !== null && void screen(file, jobDescription)}
        >
          {pending ? 'Screening…' : 'Screen my CV'}
        </Button>
        {error !== null && (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {shown !== null && (
        <>
          <CvReportView report={shown.screening.report} />
          {shown.atsText !== null && <AtsText text={shown.atsText} />}
        </>
      )}
      <ScreeningHistory
        screenings={history}
        onView={view}
        onDelete={(id) => void remove(id)}
        onDeleteAll={() => void remove()}
      />
    </div>
  );
}
