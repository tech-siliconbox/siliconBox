import type { ReactNode } from 'react';
import { GuestActions } from '@/components/shared/guest-actions';
import { PageShell } from '@/components/shared/page-shell';
import { AccountMenu } from '@/features/auth/components/account-menu';
import { optionalPageIdentity } from '@/server/auth/page-identity';
import { readPhotoUrl } from '@/server/profile';

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const identity = await optionalPageIdentity();
  const actions = identity ? (
    <AccountMenu
      name={identity.name}
      email={identity.email}
      photoUrl={await readPhotoUrl(identity.userId)}
    />
  ) : (
    <GuestActions />
  );
  return <PageShell headerActions={actions}>{children}</PageShell>;
}
