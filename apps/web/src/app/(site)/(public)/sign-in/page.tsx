import type { Metadata } from 'next';
import {
  ERRORS,
  PASSWORD_CHANGED,
  ROUTES,
  SIGNED_OUT_ELSEWHERE,
  googleSignInMessage,
} from '@siliconbox/shared';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { GoogleButton } from '@/features/auth/components/google-button';
import { SignInForm } from '@/features/auth/components/sign-in-form';
import { isGoogleSignInEnabled } from '@/server/auth/auth';
import { SiteLink } from '@/components/ui/site-link';

export const metadata: Metadata = { title: 'Sign in' };

type SignInPageProps = {
  searchParams: Promise<{ reason?: string | string[]; error?: string | string[] }>;
};

/** Why the learner is here: signed out by another device, or a Google sign-in that failed. */
function signInNotice(reason: unknown, error: unknown): string | null {
  if (reason === SIGNED_OUT_ELSEWHERE) return ERRORS.SESSION_REPLACED.message;
  if (reason === PASSWORD_CHANGED)
    return 'Your password was changed. Sign in with your new password.';
  return typeof error === 'string' ? googleSignInMessage(error) : null;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { reason, error } = await searchParams;
  const message = signInNotice(reason, error);
  const notice = message && (
    <p role="status" className="rounded-md border border-border bg-muted p-4 text-sm">
      {message}
    </p>
  );

  return (
    <AuthPanel
      alternative={isGoogleSignInEnabled() ? <GoogleButton /> : undefined}
      title="Sign in"
      subtitle="Welcome back. Sign in to continue your formal verification course."
      notice={notice}
      footer={
        <>
          New to SiliconBox?{' '}
          <SiteLink href={ROUTES.signUp} className="text-foreground underline underline-offset-4">
            Create an account
          </SiteLink>
        </>
      }
    >
      <SignInForm />
    </AuthPanel>
  );
}
