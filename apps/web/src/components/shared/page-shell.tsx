import type { ReactNode } from 'react';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

type PageShellProps = { headerActions: ReactNode; children: ReactNode };

export function PageShell({ headerActions, children }: PageShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader actions={headerActions} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
