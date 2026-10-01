import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROUTES } from '@siliconbox/shared';
import { PageShell } from '@/components/shared/page-shell';
import { SessionGuard } from '@/components/shared/session-guard';
import { Watermarked } from '@/components/shared/watermarked';
import { SignOutButton } from '@/features/auth/components/sign-out-button';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { visibleMark } from '@/server/watermark';

/** Every page a signed-in learner sees: session re-check each minute, and their watermark. */
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const identity = await requirePageIdentity();
  const headerActions = (
    <>
      <Link href={ROUTES.account} className="text-sm text-link-idle hover:text-link-hover">
        Account
      </Link>
      <SignOutButton />
    </>
  );
  return (
    <PageShell headerActions={headerActions}>
      <SessionGuard />
      <Watermarked mark={visibleMark(identity, new Date())}>{children}</Watermarked>
    </PageShell>
  );
}
