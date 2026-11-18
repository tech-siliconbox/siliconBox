import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const FILE_INPUT =
  'text-sm text-muted-foreground file:mr-3 file:rounded-[7px] file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-foreground hover:file:border-foreground';

/** A file picker in the site's button style. */
export function FileInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="file" className={cn(FILE_INPUT, className)} {...props} />;
}
