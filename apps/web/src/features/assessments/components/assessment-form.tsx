'use client';

import { API_ROUTES } from '@siliconbox/shared';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ActionForm } from '@/components/shared/action-form';
import { sendToApi } from '@/lib/api-error';

type AssessmentFormProps = {
  assessmentId: string;
  questionCount: number;
  attempt: { number: number; of: number };
  /** Where the assessment starts in the page, to come back to after scoring. */
  anchor: string;
  /** The questions, rendered on the server: radio groups named q0, q1, … */
  children: ReactNode;
};

/** Sends one attempt (an answer for every question) and shows the page again with the score. */
export function AssessmentForm({
  assessmentId,
  questionCount,
  attempt,
  anchor,
  children,
}: AssessmentFormProps) {
  const pathname = usePathname();
  const submit = (form: FormData) => {
    const answers = Array.from({ length: questionCount }, (_, i) => Number(form.get(`q${i}`)));
    return sendToApi(API_ROUTES.assessmentAttempts(assessmentId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  };
  return (
    <ActionForm
      next={`${pathname}#${anchor}`}
      submitLabel={`Submit attempt ${attempt.number} of ${attempt.of}`}
      pendingLabel="Scoring…"
      submit={submit}
    >
      {children}
    </ActionForm>
  );
}
