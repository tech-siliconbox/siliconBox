import { type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL_CLASS, Field } from './field';

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };

export function TextAreaField({ label, className, id, rows = 4, ...props }: TextAreaFieldProps) {
  const generatedId = useId();
  const areaId = id ?? generatedId;
  return (
    <Field id={areaId} label={label}>
      <textarea
        id={areaId}
        rows={rows}
        className={cn('py-2 leading-relaxed', CONTROL_CLASS, className)}
        {...props}
      />
    </Field>
  );
}
