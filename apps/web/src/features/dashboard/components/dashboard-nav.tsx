'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SiteLink } from '@/components/ui/site-link';
import { cn } from '@/lib/cn';
import { MEMBER_PAGES } from '@/lib/member-pages';

// Icon shapes after Lucide (ISC licence), drawn inline so no icon package is needed.
const ICONS: Record<(typeof MEMBER_PAGES)[number]['label'], ReactNode> = {
  Overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  Activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  Settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  Help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
};

/** The member area's pages: a column beside the page on wide screens, a row above it on phones. */
export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Your account" className="flex gap-1 overflow-x-auto lg:flex-col">
      {MEMBER_PAGES.map(({ href, label }) => (
        <SiteLink
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm text-link-idle transition-colors hover:bg-muted hover:text-link-hover',
            pathname === href && 'bg-muted font-medium text-foreground',
          )}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {ICONS[label]}
          </svg>
          {label}
        </SiteLink>
      ))}
    </nav>
  );
}
