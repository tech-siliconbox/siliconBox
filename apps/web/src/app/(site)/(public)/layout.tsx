import type { ReactNode } from 'react';
import { GuestActions } from '@/components/shared/guest-actions';
import { PageShell } from '@/components/shared/page-shell';
import { AccountMenu } from '@/features/auth/components/account-menu';
import { optionalPageIdentity } from '@/server/auth/page-identity';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const identity = await optionalPageIdentity();
  const actions = identity ? (
    <AccountMenu name={identity.name} email={identity.email} />
  ) : (
    <GuestActions />
  );
  return <PageShell headerActions={actions}>{children}</PageShell>;
}
