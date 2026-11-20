import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

/** A result's look: its words and the site's status colour. */
export type Look = { label: string; className: string };

export const GOOD = 'text-ok';
export const BAD = 'text-danger';
export const OPEN = 'text-warning';
export const QUIET = 'text-muted-foreground';

/** A check's big number, with what it counts. */
export function Score({ value, caption }: { value: string; caption: string }) {
  return (
    <div className="flex min-w-36 flex-col">
      <span className="text-3xl font-bold tracking-tight">{value}</span>
      <span className="text-[12px] text-muted-foreground">{caption}</span>
    </div>
  );
}

/** The head of a result panel: its scores, then notes and the buttons to run it again. */
export function ReportHead({ scores, children }: { scores: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-6 border-b border-border p-4">
      {scores}
      <div className="flex min-w-72 flex-1 flex-col gap-1.5 text-[13px] text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

/** A check that has not been run: what it tells, and the button that runs it. */
export function ReportIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="max-w-3xl p-5 text-[13px] leading-relaxed text-muted-foreground">
      <p className="font-semibold text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function RunButton({
  label,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? 'primary' : 'secondary'}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/** A result's status, in its colour. */
export function Mark({ look }: { look: Look }) {
  return (
    <span className={cn('whitespace-nowrap font-semibold', look.className)}>{look.label}</span>
  );
}

/** A results table of the tool: compact, a grey head, every other row shaded. */
export function ReportTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full text-left text-[13px] [&_tbody_tr:nth-child(even)]:bg-muted/40">
      <thead className="sticky top-0 border-b border-border bg-muted text-[12px] text-muted-foreground">
        <tr>
          {head.map((cell) => (
            <th key={cell} className="px-3 py-1.5 font-semibold">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">{children}</tbody>
    </table>
  );
}

/** A section title inside a result panel. */
export function ReportSection({ children }: { children: string }) {
  return <h3 className="px-4 pb-1 pt-3 text-[13px] font-semibold">{children}</h3>;
}
