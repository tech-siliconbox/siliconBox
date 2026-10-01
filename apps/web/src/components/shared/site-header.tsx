import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';
import { NAV_LINKS } from './nav-links';

export function SiteHeader({ actions }: { actions: ReactNode }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background">
      <nav
        aria-label="Main"
        className="mx-auto flex h-[52px] max-w-6xl items-center justify-between px-6"
      >
        <div className="flex items-center gap-6">
          <BrandMark />
          <ul className="hidden items-center gap-5 sm:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-sm text-link-idle hover:text-link-hover">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-4">{actions}</div>
      </nav>
    </header>
  );
}
