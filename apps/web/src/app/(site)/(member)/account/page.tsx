import { ERRORS } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { VerifyEmailButton } from '@/features/auth/components/verify-email-button';
import { requirePageIdentity } from '@/server/auth/page-identity';

export const metadata: Metadata = { title: 'Account' };

type AccountPageProps = { searchParams: Promise<{ error?: string | string[] }> };

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const identity = await requirePageIdentity();
  // A verification link that failed sends the learner back here with an error code.
  const linkFailed = (await searchParams).error !== undefined && !identity.emailVerified;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-20 pt-16 sm:px-6">
      <Eyebrow>Account</Eyebrow>
      <h1 className="text-4xl font-bold tracking-tighter">Your account</h1>
      <Card>
        <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{identity.email}</dd>
          <dt className="text-muted-foreground">Email verified</dt>
          <dd className="flex flex-col gap-3">
            {identity.emailVerified ? (
              'Yes'
            ) : (
              <>
                <span>Not yet. Verification is needed before a purchase.</span>
                {linkFailed && (
                  <span role="alert">{ERRORS.INVALID_LINK.message} Send a new one.</span>
                )}
                <VerifyEmailButton email={identity.email} />
              </>
            )}
          </dd>
        </dl>
      </Card>
    </div>
  );
}
