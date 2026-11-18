import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shared/brand-mark';
import { Card } from '@/components/ui/card';

type AuthPanelProps = {
  title: string;
  subtitle: string;
  notice?: ReactNode;
  /** Another way in (Google), shown above the form with an "or" between them. */
  alternative?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

/** The centred card for signing in, signing up and resetting a password. */
export function AuthPanel({
  title,
  subtitle,
  notice,
  alternative,
  footer,
  children,
}: AuthPanelProps) {
  return (
    <div className="mx-auto w-full max-w-sm px-4 pb-20 pt-12 sm:px-0 sm:pt-16">
      <Card className="flex flex-col gap-5 sm:p-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandMark />
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </header>
        {notice}
        {alternative && (
          <>
            {alternative}
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              or
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        {children}
        <p className="text-center text-sm text-muted-foreground">{footer}</p>
      </Card>
    </div>
  );
}
