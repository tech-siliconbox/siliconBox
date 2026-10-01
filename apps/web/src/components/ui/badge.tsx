import { type VariantProps, cva } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const badgeVariants = cva('inline-flex items-center font-mono uppercase tracking-widest', {
  variants: {
    variant: {
      outline: 'border border-border px-1.5 py-0.5 text-[9.5px] text-muted-foreground',
      muted: 'rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground',
      inverted: 'rounded bg-foreground px-2 py-0.5 text-[10px] text-background',
    },
  },
  defaultVariants: { variant: 'outline' },
});

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
