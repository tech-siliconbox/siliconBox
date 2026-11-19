import type { ReactNode } from 'react';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * The space above and below every page's content: one setting for the whole site, small enough
 * that a short page (pricing, a sign-in form) fits a laptop window without scrolling.
 */
export const PAGE_SPACING = 'py-8';

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
