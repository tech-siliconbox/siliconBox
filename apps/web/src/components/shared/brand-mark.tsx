import { ROUTES } from '@siliconbox/shared';
import { CspImage } from '@/components/ui/csp-image';
import { cn } from '@/lib/cn';
import { SiteLink } from '@/components/ui/site-link';

/** The logo icon with "SiliconBox" as live text beside it (docs/product/brand.md). */
export function BrandMark({ className }: { className?: string }) {
  return (
    <SiteLink href={ROUTES.home} className={cn('inline-flex items-center gap-1.5', className)}>
      <CspImage src="/brand/siliconbox-logo.png" alt="" width={28} height={28} preload />
      <span className="font-bold tracking-[-0.03em]">SiliconBox</span>
    </SiteLink>
  );
}
