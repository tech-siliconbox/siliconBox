import Link from 'next/link';
import { ROUTES } from '@siliconbox/shared';
import { buttonVariants } from '@/components/ui/button';

export function GuestActions() {
  return (
    <>
      <Link href={ROUTES.signIn} className="text-sm text-link-idle hover:text-link-hover">
        Sign in
      </Link>
      <Link href={ROUTES.signUp} className={buttonVariants({ size: 'sm' })}>
        Get started
      </Link>
    </>
  );
}
