import type { ReactNode } from 'react';

type FieldProps = {
  id: string;
  label: string;
  /** A small link at the end of the label row, such as "Forgot password?". */
  action?: ReactNode;
  children: ReactNode;
};

/** A label above its control; the control must use `id`. */
export function Field({ id, label, action, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      {children}
    </div>
  );
}

export const CONTROL_CLASS =
  'rounded-md border border-border bg-background px-3 text-sm focus-visible:border-foreground';
