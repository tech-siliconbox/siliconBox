import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@siliconbox/shared';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { GoogleButton } from '@/features/auth/components/google-button';
import { SignUpForm } from '@/features/auth/components/sign-up-form';
import { isGoogleSignInEnabled } from '@/server/auth/auth';

export const metadata: Metadata = { title: 'Create an account' };

export default function SignUpPage() {
  return (
    <AuthPanel
      title="Create an account"
      footer={
        <>
          Already have an account?{' '}
          <Link href={ROUTES.signIn} className="text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
      {isGoogleSignInEnabled() && <GoogleButton />}
    </AuthPanel>
  );
}
