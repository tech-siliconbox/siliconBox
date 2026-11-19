'use client';

import {
  AI_FEEDBACK_LIMITS,
  AI_NOTICE,
  type CvScreening,
  type StoredCvFeedback,
} from '@siliconbox/shared';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCvFeedback } from '../../hooks/use-cv-feedback';
import { AiFeedbackView } from './ai-feedback-view';

type AskProps = {
  screening: CvScreening;
  jobDescription: string;
  onGiven: (screeningId: string, feedback: StoredCvFeedback) => void;
};

/** The notice, the learner's agreement (unticked by default) and the request. */
function AskForFeedback({ screening, jobDescription, onGiven }: AskProps) {
  const consentId = useId();
  const [agreed, setAgreed] = useState(false);
  const { pending, error, ask } = useCvFeedback(onGiven);
  const again = screening.feedback !== undefined;
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted-foreground">
        {AI_NOTICE.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li>
          {jobDescription.trim() === ''
            ? 'Paste a job description above to also hear how well you fit that job.'
            : 'It also judges your fit for the job description above.'}
        </li>
      </ul>
      <label htmlFor={consentId} className="flex items-start gap-2 text-sm">
        <input
          id={consentId}
          type="checkbox"
          checked={agreed}
          disabled={pending}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-1"
        />
        I agree to send this CV&apos;s text to Anthropic as described above.
      </label>
      <Button
        className="w-fit"
        disabled={!agreed || pending}
        onClick={() => void ask(screening.publicId, jobDescription)}
      >
        {pending ? 'Writing feedback… up to a minute' : again ? 'Ask again' : 'Get AI feedback'}
      </Button>
      <p className="text-[12px] text-muted-foreground">
        You can ask {AI_FEEDBACK_LIMITS.perDay} times a day and {AI_FEEDBACK_LIMITS.perMonth} a
        month. A failed attempt does not count.
      </p>
      {error !== null && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

type AiFeedbackPanelProps = AskProps & { available: boolean };

/** Feedback already given on this screening, and the way to ask for it while AI is on. */
export function AiFeedbackPanel({ available, ...ask }: AiFeedbackPanelProps) {
  const headingId = useId();
  const { feedback, file } = ask.screening;
  if (feedback === undefined && !available) return null;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-card border border-border p-6"
    >
      <h2 id={headingId} className="text-base font-bold tracking-tight">
        AI feedback
      </h2>
      {feedback !== undefined && <AiFeedbackView feedback={feedback} />}
      {available && file !== undefined && <AskForFeedback {...ask} />}
      {available && file === undefined && (
        <p className="text-sm text-muted-foreground">
          We no longer keep this CV&apos;s file. Upload it again to get AI feedback.
        </p>
      )}
    </section>
  );
}
