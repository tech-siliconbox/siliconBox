import type { Metadata } from 'next';
import { listToolSessions } from '@/db/tool-sessions';
import { PramanLocked } from '@/features/praman/components/praman-locked';
import { PramanWorkbench } from '@/features/praman/components/praman-workbench';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { pramanAccess } from '@/server/entitlements';

export const metadata: Metadata = {
  title: 'Praman',
  robots: { index: false, follow: false },
};

/** Praman, the formal tool (ADR 0031): the learner's own designs, proven within their level. */
export default async function ToolPage() {
  const identity = await requirePageIdentity();
  const ceilings = await pramanAccess(identity);
  if (ceilings === null) return <PramanLocked />;
  const sessions = await listToolSessions(identity.userId);
  return (
    <div className="p-2">
      <p className="p-4 text-sm md:hidden">
        Praman needs a larger screen. Open this page on a computer or a tablet.
      </p>
      <div className="hidden h-[calc(100dvh-53px-1rem)] min-h-[36rem] md:block">
        <PramanWorkbench initialSessions={sessions} ceilings={ceilings} />
      </div>
    </div>
  );
}
