import type { Metadata } from 'next';
import { LessonBlockRenderer } from '@/components/lesson/lesson-block-renderer';
import { PaidContentLocked } from '@/components/shared/paid-content-locked';
import { ProtectedContent } from '@/components/shared/protected-content';
import { Eyebrow } from '@/components/ui/eyebrow';
import { DrillWorkspace } from '@/features/drills/components/drill-workspace';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readDrill } from '@/server/drills';
import { isLocked, loadPaidContent } from '@/server/paid-page';

// Drill text must never be indexed or cached; the page renders per request (ADR 0007).
export const metadata: Metadata = { title: 'Drill', robots: { index: false, follow: false } };

type DrillPageProps = { params: Promise<{ drillId: string }> };

export default async function DrillPage({ params }: DrillPageProps) {
  const { drillId } = await params;
  const identity = await requirePageIdentity();
  const page = await loadPaidContent(() => readDrill(identity, drillId));
  if (isLocked(page))
    return <PaidContentLocked title="This Drill is locked" reason={page.locked} />;

  const { drill, canRun } = page;
  return (
    <div className="grid border-b border-border lg:grid-cols-[38fr_62fr]">
      <article className="border-border px-6 pb-16 pt-10 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:border-r">
        <header className="mb-6 flex flex-col gap-2">
          <Eyebrow>{drill.topic ? `Drill · ${drill.topic}` : 'Drill'}</Eyebrow>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">{drill.title}</h1>
        </header>
        <ProtectedContent>
          {drill.brief.map((block, index) => (
            <LessonBlockRenderer key={index} block={block} />
          ))}
        </ProtectedContent>
      </article>
      <DrillWorkspace
        drill={{
          publicId: drill.publicId,
          designCode: drill.designCode,
          starterCode: drill.starterCode,
          target: drill.target,
        }}
        canRun={canRun}
      />
    </div>
  );
}
