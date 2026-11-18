import { ROUTES } from '@siliconbox/shared';
import { SignOutButton } from './sign-out-button';
import { SiteLink } from '@/components/ui/site-link';

/** The header's links for a signed-in learner. */
export function AccountActions() {
  return (
    <>
      <SiteLink href={ROUTES.account} className="text-sm text-link-idle hover:text-link-hover">
        Account
      </SiteLink>
      <SignOutButton />
    </>
  );
}
