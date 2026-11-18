import { ROUTES } from '@siliconbox/shared';
import { buttonVariants } from '@/components/ui/button';
import { SiteLink } from '@/components/ui/site-link';

export function GuestActions() {
  return (
    <>
      <SiteLink href={ROUTES.signIn} className="text-sm text-link-idle hover:text-link-hover">
        Sign in
      </SiteLink>
      <SiteLink href={ROUTES.signUp} className={buttonVariants({ size: 'sm' })}>
        Get started
      </SiteLink>
    </>
  );
}
