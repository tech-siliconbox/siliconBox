'use client';

import { JOB_DESCRIPTION_MAX_CHARS } from '@siliconbox/shared';
import { useId } from 'react';
import { TextAreaField } from '@/components/ui/text-area-field';

type JobDescriptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
};

/** An optional job posting to match against; used by CV screening and the resume check. */
export function JobDescriptionField({ value, onChange, disabled }: JobDescriptionFieldProps) {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <TextAreaField
        label="Job description (optional)"
        rows={5}
        value={value}
        maxLength={JOB_DESCRIPTION_MAX_CHARS}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={hintId} className="text-[12px] text-muted-foreground">
        Paste a job posting to see which of its formal verification and hardware terms you show. We
        match it and do not keep it.
      </p>
    </div>
  );
}
