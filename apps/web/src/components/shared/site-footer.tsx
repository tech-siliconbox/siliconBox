import Link from 'next/link';
import { BrandMark } from './brand-mark';
import { NAV_LINKS } from './nav-links';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pb-8 pt-12 sm:flex-row sm:justify-between">
        <BrandMark />
        <nav aria-label="Footer" className="flex gap-6 text-[13px]">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="text-link-idle hover:text-link-hover">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-6 pb-8 font-mono text-[11px] text-muted-foreground">
        © {new Date().getFullYear()} SiliconBox
      </p>
    </footer>
  );
}
