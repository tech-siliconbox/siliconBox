import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Bordered surface. No shadows: the design uses borders only. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card border border-border bg-card p-6', className)} {...props} />
  );
}
