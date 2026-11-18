import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from '@/lib/cn';
import { CONTROL_CLASS, Field } from './field';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; action?: ReactNode };

export function TextField({ label, action, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field id={inputId} label={label} action={action}>
      <input id={inputId} className={cn('h-10', CONTROL_CLASS, className)} {...props} />
    </Field>
  );
}
