import type { ReactNode } from 'react';
import { GuestActions } from '@/components/shared/guest-actions';
import { PageShell } from '@/components/shared/page-shell';
import { AccountActions } from '@/features/auth/components/account-actions';
import { optionalPageIdentity } from '@/server/auth/page-identity';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const signedIn = (await optionalPageIdentity()) !== null;
  return (
    <PageShell headerActions={signedIn ? <AccountActions /> : <GuestActions />}>
      {children}
    </PageShell>
  );
}
