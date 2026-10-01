import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { TwoFactorSettings } from '@/features/auth/components/two-factor-settings';
import { requirePageIdentity } from '@/server/auth/page-identity';

export const metadata: Metadata = { title: 'Account' };

export default async function AccountPage() {
  const identity = await requirePageIdentity();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pb-20 pt-16">
      <Eyebrow>Account</Eyebrow>
      <h1 className="text-4xl font-bold tracking-tighter">Your account</h1>
      <Card>
        <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{identity.email}</dd>
          <dt className="text-muted-foreground">Email verified</dt>
          <dd>
            {identity.emailVerified ? 'Yes' : 'Not yet. Verification is needed before a purchase.'}
          </dd>
        </dl>
      </Card>
      <Card>
        <TwoFactorSettings enabled={identity.twoFactorEnabled} />
      </Card>
    </div>
  );
}
