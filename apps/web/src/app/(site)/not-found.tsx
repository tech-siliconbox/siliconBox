import { ROUTES } from '@siliconbox/shared';
import { ErrorState } from '@/components/shared/error-state';
import { buttonVariants } from '@/components/ui/button';
import { SiteLink } from '@/components/ui/site-link';

/**
 * A page that does not exist, or is not open (a lesson of a course coming soon), in the site's
 * design. Never Next's default page: the CSP blocks its inline styles.
 */
export default function SiteNotFound() {
  return (
    <ErrorState
      title="Page not found"
      description="This page does not exist, or is not open yet."
      action={
        <SiteLink
          href={ROUTES.courses}
          className={buttonVariants({ size: 'sm', variant: 'secondary' })}
        >
          See the courses
        </SiteLink>
      }
    />
  );
}
