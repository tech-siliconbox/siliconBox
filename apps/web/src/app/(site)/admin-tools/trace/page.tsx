import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminToolHeader } from '@/features/admin-tools/components/admin-tool-header';
import { TraceForm } from '@/features/admin-tools/components/trace-form';
import { cmsAdminSession, hasAdminRole } from '@/server/cms-admin';
import { traceLeakAction } from '@/server/watermark-trace-action';

export const metadata: Metadata = {
  title: 'Trace a leak',
  robots: { index: false, follow: false },
};

/** Support and Owner only; anyone else gets "not found", as for the lesson preview. */
export default async function TracePage() {
  const session = await cmsAdminSession();
  if (session === null || !hasAdminRole(session.admin.role, ['support', 'owner'])) notFound();
  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pb-20 pt-16">
      <AdminToolHeader title="Trace a leak">
        Every paid passage carries the reader&apos;s hidden code, and every signed-in page shows a
        visible mark. Paste what was leaked to see which account it came from. Each trace is
        recorded in the audit log.
      </AdminToolHeader>
      <TraceForm action={traceLeakAction} />
    </section>
  );
}
