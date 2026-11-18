import type { Metadata } from 'next';
import { ROUTES } from '@siliconbox/shared';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { GoogleButton } from '@/features/auth/components/google-button';
import { SignUpForm } from '@/features/auth/components/sign-up-form';
import { isGoogleSignInEnabled } from '@/server/auth/auth';
import { SiteLink } from '@/components/ui/site-link';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <AuthPanel
      alternative={isGoogleSignInEnabled() ? <GoogleButton /> : undefined}
      title="Create your account"
      subtitle="Learn formal verification with real tools and hands-on Drills."
      footer={
        <>
          Already have an account?{' '}
          <SiteLink href={ROUTES.signIn} className="text-foreground underline underline-offset-4">
            Sign in
          </SiteLink>
        </>
      }
    >
      <SignUpForm />
    </AuthPanel>
  );
}
