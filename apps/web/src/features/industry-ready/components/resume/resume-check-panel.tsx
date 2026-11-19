'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useResumeCheck } from '../../hooks/use-resume-check';
import { AtsText } from '../cv/ats-text';
import { CvReportView } from '../cv/cv-report';
import { JobDescriptionField } from '../cv/job-description-field';

type ResumeCheckPanelProps = {
  id: string;
  /** The check reads the saved resume, so unsaved changes are saved first; false stops it. */
  saveFirst: () => Promise<boolean>;
};

/** Screens the resume's own PDF like an uploaded CV, optionally against a job; nothing is kept. */
export function ResumeCheckPanel({ id, saveFirst }: ResumeCheckPanelProps) {
  const [jobDescription, setJobDescription] = useState('');
  const { pending, error, result, check } = useResumeCheck();

  async function run() {
    if (await saveFirst()) await check(jobDescription);
  }

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-4 rounded-card border border-border p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-base font-bold tracking-tight">
          Check this resume
        </h2>
        <p className="text-sm text-muted-foreground">
          We build your PDF, read it back the way an applicant tracking system does, and screen it
          like an uploaded CV. Nothing is kept.
        </p>
      </div>
      <JobDescriptionField value={jobDescription} onChange={setJobDescription} disabled={pending} />
      <Button className="w-fit" disabled={pending} onClick={() => void run()}>
        {pending ? 'Checking…' : 'Run the check'}
      </Button>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result !== null && (
        <>
          <CvReportView report={result.report} />
          <AtsText text={result.atsText} />
        </>
      )}
    </section>
  );
}
