import type { ReactNode } from 'react';
import { PageShell } from '@/components/shared/page-shell';
import { SessionGuard } from '@/components/shared/session-guard';
import { Watermarked } from '@/components/shared/watermarked';
import { AccountMenu } from '@/features/auth/components/account-menu';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { visibleMark } from '@/server/watermark';

/** Every page a signed-in learner sees: session re-check each minute, and their watermark. */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const identity = await requirePageIdentity();
  return (
    <PageShell headerActions={<AccountMenu name={identity.name} email={identity.email} />}>
      <SessionGuard />
      <Watermarked mark={visibleMark(identity, new Date())}>{children}</Watermarked>
    </PageShell>
  );
}
