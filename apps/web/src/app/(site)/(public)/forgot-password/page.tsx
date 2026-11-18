import { ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { SiteLink } from '@/components/ui/site-link';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ForgotPasswordPage() {
  return (
    <AuthPanel
      title="Reset your password"
      subtitle="Enter your account's email and we will send you a link to choose a new password."
      footer={
        <>
          Remembered it?{' '}
          <SiteLink href={ROUTES.signIn} className="text-foreground underline underline-offset-4">
            Sign in
          </SiteLink>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthPanel>
  );
}
