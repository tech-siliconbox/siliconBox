import { type VariantProps, cva } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-foreground bg-foreground text-background hover:opacity-90',
        secondary: 'border-border bg-background text-foreground hover:border-foreground',
      },
      size: {
        lg: 'h-12 rounded-button px-8 text-base',
        md: 'h-10 rounded-button px-5 text-sm',
        sm: 'h-8 rounded-[7px] px-4 text-[13px] font-semibold',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
