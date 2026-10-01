import type { Metadata } from 'next';
import Link from 'next/link';
import { ERRORS, ROUTES, SIGNED_OUT_ELSEWHERE } from '@siliconbox/shared';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { GoogleButton } from '@/features/auth/components/google-button';
import { SignInForm } from '@/features/auth/components/sign-in-form';
import { isGoogleSignInEnabled } from '@/server/auth/auth';

export const metadata: Metadata = { title: 'Sign in' };

type SignInPageProps = { searchParams: Promise<{ reason?: string | string[] }> };

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { reason } = await searchParams;
  const notice =
    reason === SIGNED_OUT_ELSEWHERE ? (
      <p role="status" className="rounded-md border border-border bg-muted p-4 text-sm">
        {ERRORS.SESSION_REPLACED.message}
      </p>
    ) : undefined;

  return (
    <AuthPanel
      title="Sign in"
      notice={notice}
      footer={
        <>
          New to SiliconBox?{' '}
          <Link href={ROUTES.signUp} className="text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />
      {isGoogleSignInEnabled() && <GoogleButton />}
    </AuthPanel>
  );
}
