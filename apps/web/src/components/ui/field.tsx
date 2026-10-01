import type { ReactNode } from 'react';

/** A label above its control; the control must use `id`. */
export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export const CONTROL_CLASS =
  'rounded-md border border-border bg-background px-3 text-sm focus-visible:border-foreground';
