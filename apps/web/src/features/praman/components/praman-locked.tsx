import { ERRORS, ROUTES } from '@siliconbox/shared';
import { LockedCard } from '@/components/shared/locked-card';
import { PAGE_SPACING } from '@/components/shared/page-shell';
import { buttonVariants } from '@/components/ui/button';
import { SiteLink } from '@/components/ui/site-link';

/** Shown instead of Praman to a learner without a plan and a tool window (ADR 0031). */
export function PramanLocked() {
  return (
    <div className={`mx-auto max-w-2xl px-6 ${PAGE_SPACING}`}>
      <LockedCard
        title="Praman"
        reason={`Praman, the formal tool, comes with every plan's tool access. ${ERRORS.NOT_ENTITLED.message}`}
        action={
          <SiteLink
            href={ROUTES.pricing}
            className={buttonVariants({ size: 'sm', className: 'w-fit' })}
          >
            See pricing
          </SiteLink>
        }
      />
    </div>
  );
}
