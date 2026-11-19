'use client';

import type { CvScreening } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCvScreenings } from '../../hooks/use-cv-screenings';
import { AiFeedbackPanel } from './ai-feedback-panel';
import { AtsText } from './ats-text';
import { CvReportView } from './cv-report';
import { DropZone } from './drop-zone';
import { JobDescriptionField } from './job-description-field';
import { ScreeningHistory } from './screening-history';

type CvScreenerProps = { initial: CvScreening[]; aiAvailable: boolean };

/** Upload, screen (optionally against a job), read the report, ask for AI feedback; kept until deleted. */
export function CvScreener({ initial, aiAvailable }: CvScreenerProps) {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const screenings = useCvScreenings(initial);
  const { pending, error, history, shown, view, screen, remove } = screenings;
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
          <AiFeedbackPanel
            key={shown.screening.publicId}
            screening={shown.screening}
            jobDescription={jobDescription}
            available={aiAvailable}
            onGiven={screenings.attachFeedback}
          />
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
