import { cn } from '@/lib/cn';

/** Praman's own mark: the blue P and its name, in the site header and the tool's menu bar. */
export function PramanMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-bold text-info', className)}>
      <span
        aria-hidden="true"
        className="grid size-[17px] place-items-center rounded-[3px] bg-info text-[11px] leading-none text-background"
      >
        P
      </span>
      Praman
    </span>
  );
}
