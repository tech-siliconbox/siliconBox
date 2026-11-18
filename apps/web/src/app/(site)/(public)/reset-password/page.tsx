import { ERRORS, ROUTES } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { SiteLink } from '@/components/ui/site-link';
import { AuthPanel } from '@/features/auth/components/auth-panel';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

// The reset link's one-time token arrives in the address; the page is never indexed.
export const metadata: Metadata = {
  title: 'Set a new password',
  robots: { index: false, follow: false },
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token, error } = await searchParams;
  const usable = typeof token === 'string' && token !== '' && error === undefined;
  return (
    <AuthPanel
      title="Set a new password"
      subtitle="Choose a new password for your account. Every device will be signed out."
      footer={
        <SiteLink
          href={ROUTES.forgotPassword}
          className="text-foreground underline underline-offset-4"
        >
          Ask for a new link
        </SiteLink>
      }
    >
      {usable ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p role="alert" className="rounded-md border border-border bg-muted p-4 text-sm">
          {ERRORS.INVALID_LINK.message} Ask for a new one below.
        </p>
      )}
    </AuthPanel>
  );
}
