import type { Metadata } from 'next';
import { PAGE_SPACING } from '@/components/shared/page-shell';
import { Eyebrow } from '@/components/ui/eyebrow';
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
    <div className={`mx-auto flex max-w-[110rem] flex-col gap-3 px-4 ${PAGE_SPACING}`}>
      <header className="flex flex-col gap-1">
        <Eyebrow>Formal Tool</Eyebrow>
        <h1 className="text-3xl font-bold tracking-tighter">Praman</h1>
        <p className="text-sm text-muted-foreground">
          Add your design and SVA files, analyze and elaborate them, set the clock and reset, and
          prove. Each proof runs up to {ceilings.proofSeconds / 60} minutes and{' '}
          {ceilings.traceLength} cycles; you have {ceilings.dailySeconds / 60} proof minutes a day.
        </p>
      </header>
      <p className="text-sm md:hidden">
        Praman needs a larger screen. Open this page on a computer or a tablet.
      </p>
      <div className="hidden h-[calc(100dvh-13rem)] min-h-[34rem] md:block">
        <PramanWorkbench initialSessions={sessions} ceilings={ceilings} />
      </div>
    </div>
  );
}
