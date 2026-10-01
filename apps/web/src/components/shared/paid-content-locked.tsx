import { ERRORS, ROUTES } from '@siliconbox/shared';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { LockedCard } from './locked-card';

type PaidContentLockedProps = { title: string; reason: 'NOT_ENTITLED' | 'RATE_LIMITED' };

/** Why paid content is not shown, with the way forward when there is one. */
export function PaidContentLocked({ title, reason }: PaidContentLockedProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-16">
      <LockedCard
        title={title}
        reason={ERRORS[reason].message}
        action={
          reason === 'NOT_ENTITLED' ? (
            <Link
              href={ROUTES.pricing}
              className={buttonVariants({ size: 'sm', className: 'w-fit' })}
            >
              See pricing
            </Link>
          ) : undefined
        }
      />
    </div>
  );
}
