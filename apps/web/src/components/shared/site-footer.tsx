import { BrandMark } from './brand-mark';
import { NAV_LINKS } from './nav-links';
import { SiteLink } from '@/components/ui/site-link';

/** One compact row on wider screens (brand, links, copyright), so short pages fit the window. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <BrandMark />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
          {NAV_LINKS.map((link) => (
            <SiteLink
              key={link.href}
              href={link.href}
              className="text-link-idle hover:text-link-hover"
            >
              {link.label}
            </SiteLink>
          ))}
        </nav>
        <p className="font-mono text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} SiliconBox
        </p>
      </div>
    </footer>
  );
}
