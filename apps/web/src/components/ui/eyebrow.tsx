import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Small mono uppercase label above headings and sections. */
export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        'font-mono text-[11px] uppercase tracking-widest text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
