import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** The eyebrow's look, for a heading or table cell that is not a paragraph. */
export const EYEBROW_CLASS =
  'font-mono text-[11px] uppercase tracking-widest text-muted-foreground';

/** Small mono uppercase label above headings and sections. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn(EYEBROW_CLASS, className)} {...props} />;
}
