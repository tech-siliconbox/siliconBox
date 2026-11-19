'use client';

import type { CvScreening, StoredCvFeedback } from '@siliconbox/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { useCvFeedback } from '../../hooks/use-cv-feedback';
import { AiComingSoon } from '../ai-coming-soon';
import { AiConsent } from '../ai-consent';
import { PanelFrame } from '../panel-frame';
import { AiFeedbackView } from './ai-feedback-view';

type AskProps = {
  screening: CvScreening;
  jobDescription: string;
  onGiven: (screeningId: string, feedback: StoredCvFeedback) => void;
};

/** The notice, the learner's agreement (unticked by default) and the request. */
function AskForFeedback({ screening, jobDescription, onGiven }: AskProps) {
  const [agreed, setAgreed] = useState(false);
  const { pending, error, ask } = useCvFeedback(onGiven);
  const label = screening.feedback === undefined ? 'Get AI feedback' : 'Ask again';
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <AiConsent
        feature="cvFeedback"
        agreed={agreed}
        onAgreed={setAgreed}
        disabled={pending}
        note={
          jobDescription.trim() === ''
            ? 'Paste a job description above to also hear how well you fit that job.'
            : 'It also judges your fit for the job description above.'
        }
      />
      <Button
        className="w-fit"
        disabled={!agreed || pending}
        onClick={() => void ask(screening.publicId, jobDescription)}
      >
        {pending ? 'Writing feedback… up to a minute' : label}
      </Button>
      <FormError message={error} />
    </div>
  );
}

type AiFeedbackPanelProps = AskProps & { available: boolean };

/** Feedback already given on this screening, and the way to ask for it while AI is on. */
export function AiFeedbackPanel({ available, ...ask }: AiFeedbackPanelProps) {
  const { feedback, file } = ask.screening;
  return (
    <PanelFrame title="AI feedback">
      {feedback !== undefined && <AiFeedbackView feedback={feedback} />}
      {available && file !== undefined && <AskForFeedback {...ask} />}
      {!available && feedback === undefined && <AiComingSoon feature="Feedback on your CV" />}
      {available && file === undefined && (
        <p className="text-sm text-muted-foreground">
          We no longer keep this CV&apos;s file. Upload it again to get AI feedback.
        </p>
      )}
    </PanelFrame>
  );
}
