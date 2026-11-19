import { ERRORS, ROUTES } from '@siliconbox/shared';
import { buttonVariants } from '@/components/ui/button';
import { LockedCard } from './locked-card';
import { SiteLink } from '@/components/ui/site-link';
import { PAGE_SPACING } from './page-shell';

type PaidContentLockedProps = { title: string; reason: 'NOT_ENTITLED' | 'RATE_LIMITED' };

/** Why paid content is not shown, with the way forward when there is one. */
export function PaidContentLocked({ title, reason }: PaidContentLockedProps) {
  return (
    <div className={`mx-auto max-w-2xl px-6 ${PAGE_SPACING}`}>
      <LockedCard
        title={title}
        reason={ERRORS[reason].message}
        action={
          reason === 'NOT_ENTITLED' ? (
            <SiteLink
              href={ROUTES.pricing}
              className={buttonVariants({ size: 'sm', className: 'w-fit' })}
            >
              See pricing
            </SiteLink>
          ) : undefined
        }
      />
    </div>
  );
}
