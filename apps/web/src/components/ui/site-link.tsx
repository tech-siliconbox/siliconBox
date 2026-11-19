'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ComponentProps } from 'react';

/**
 * A thin bar across the top of the window while the clicked link's page loads. Links never
 * prefetch, so a click waits for the server; this shows it is on its way (after a short delay,
 * so quick pages do not flicker).
 */
function PendingBar() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      data-nav-pending=""
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden animate-nav-pending-show"
    >
      <span className="block h-full w-1/4 bg-foreground animate-nav-pending-slide motion-reduce:w-full motion-reduce:animate-none" />
    </span>
  );
}

/**
 * Every link within the site. It never prefetches: a page is fetched only when the learner opens
 * it, so a page loads nothing it does not show (golden rule, ADR 0027). Lint keeps `next/link`
 * to this file.
 */
export function SiteLink({ children, ...props }: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  return (
    <Link {...props} prefetch={false}>
      {children}
      <PendingBar />
    </Link>
  );
}
