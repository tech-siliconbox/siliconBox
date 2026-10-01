import type { Metadata } from 'next';
import Link from 'next/link';
import { ROUTES } from '@siliconbox/shared';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { TwoFactorChallengeForm } from '@/features/auth/components/two-factor-challenge-form';

export const metadata: Metadata = { title: 'Two-factor sign-in' };

export default function TwoFactorSignInPage() {
  return (
    <AuthPanel
      title="Enter your code"
      footer={
        <Link href={ROUTES.signIn} className="text-foreground underline underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <TwoFactorChallengeForm />
    </AuthPanel>
  );
}
