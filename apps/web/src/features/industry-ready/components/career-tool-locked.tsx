import { ERRORS, ROUTES } from '@siliconbox/shared';
import Link from 'next/link';
import { LockedCard } from '@/components/shared/locked-card';
import { buttonVariants } from '@/components/ui/button';

type CareerToolLockedProps = { title: string; reason: 'SERVICE_LOCKED' | 'NOT_ENTITLED' };

/** Shown instead of a career tool the learner cannot use yet, with the way forward. */
export function CareerToolLocked({ title, reason }: CareerToolLockedProps) {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-20 pt-16">
      <LockedCard
        title={title}
        reason={
          reason === 'NOT_ENTITLED'
            ? 'Free for learners with an active course. ' + ERRORS.NOT_ENTITLED.message
            : ERRORS.SERVICE_LOCKED.message
        }
        action={
          <Link
            href={reason === 'NOT_ENTITLED' ? ROUTES.pricing : ROUTES.industryReady}
            className={buttonVariants({ size: 'sm', className: 'w-fit' })}
          >
            {reason === 'NOT_ENTITLED' ? 'See pricing' : 'Back to Industry Ready'}
          </Link>
        }
      />
    </div>
  );
}
