import Link from 'next/link';
import type { ComponentProps } from 'react';

/**
 * Every link within the site. It never prefetches: a page is fetched only when the learner opens
 * it, so a page loads nothing it does not show (golden rule, ADR 0027). Lint keeps `next/link`
 * to this file.
 */
export function SiteLink(props: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  return <Link {...props} prefetch={false} />;
}
