import type { ReactNode } from 'react';
import { GuestActions } from '@/components/shared/guest-actions';
import { PageShell } from '@/components/shared/page-shell';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PageShell headerActions={<GuestActions />}>{children}</PageShell>;
}
