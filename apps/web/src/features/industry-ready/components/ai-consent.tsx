'use client';

import { AI_ALLOWANCE, AI_NOTICES, type AiFeature } from '@siliconbox/shared';
import { useId } from 'react';

type AiConsentProps = {
  feature: AiFeature;
  agreed: boolean;
  onAgreed: (agreed: boolean) => void;
  disabled: boolean;
  /** A last line about this request, such as whether a job description goes too. */
  note?: string | undefined;
};

/** What is sent where (the feature's notice), the learner's agreement, unticked, and the allowance. */
export function AiConsent({ feature, agreed, onAgreed, disabled, note }: AiConsentProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[13px] text-muted-foreground">
        {AI_NOTICES[feature].map((line) => (
          <li key={line}>{line}</li>
        ))}
        {note !== undefined && <li>{note}</li>}
      </ul>
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={agreed}
          disabled={disabled}
          onChange={(event) => onAgreed(event.target.checked)}
          className="mt-1"
        />
        I agree to send this to Anthropic as described above.
      </label>
      <p className="text-[12px] text-muted-foreground">
        You can ask for AI help {AI_ALLOWANCE.perDay} times a day and {AI_ALLOWANCE.perMonth} a
        month. A failed attempt does not count.
      </p>
    </div>
  );
}
