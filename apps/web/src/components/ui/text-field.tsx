import { type InputHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function TextField({ label, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        className={cn(
          'h-10 rounded-md border border-border bg-background px-3 text-sm focus-visible:border-foreground',
          className,
        )}
        {...props}
      />
    </div>
  );
}
