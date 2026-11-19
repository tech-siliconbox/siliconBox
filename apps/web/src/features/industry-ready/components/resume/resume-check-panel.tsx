'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { useResumeCheck } from '../../hooks/use-resume-check';
import { AtsText } from '../cv/ats-text';
import { CvReportView } from '../cv/cv-report';
import { JobDescriptionField } from '../cv/job-description-field';
import { PanelFrame } from '../panel-frame';

/** Screens the resume's own PDF like an uploaded CV, optionally against a job; nothing is kept. */
export function ResumeCheckPanel({ settle }: { settle: () => Promise<string | null> }) {
  const [jobDescription, setJobDescription] = useState('');
  const { pending, error, result, check } = useResumeCheck();

  async function run() {
    const publicId = await settle();
    if (publicId !== null) await check(publicId, jobDescription);
  }

  return (
    <PanelFrame
      title="Check this resume"
      description="We build your PDF, read it back the way an applicant tracking system does, and screen it like an uploaded CV. Nothing is kept."
    >
      <JobDescriptionField value={jobDescription} onChange={setJobDescription} disabled={pending} />
      <Button className="w-fit" disabled={pending} onClick={() => void run()}>
        {pending ? 'Checking…' : 'Run the check'}
      </Button>
      <FormError message={error} />
      {result !== null && (
        <>
          <CvReportView report={result.report} />
          <AtsText text={result.atsText} />
        </>
      )}
    </PanelFrame>
  );
}
