import 'server-only';
import { type LessonBlock, ROUTES } from '@siliconbox/shared';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/ui/eyebrow';
import { DrillWorkspace } from '@/features/drills/components/drill-workspace';
import { requirePageIdentity } from '@/server/auth/page-identity';
import { readEmbeddedDrill } from '@/server/drills';

type DrillEmbedProps = {
  slug: string;
  /** Renders the Drill's brief; passed in so this file does not import the block renderer. */
  renderBlocks: (blocks: LessonBlock[]) => ReactNode;
};

/**
 * Practice right in the lesson: the Drill's brief and the tool, after the lab it belongs to.
 * The editor stays copyable inside protected content. Left out when the Drill is not
 * published or not open to this learner.
 */
export async function DrillEmbed({ slug, renderBlocks }: DrillEmbedProps) {
  const page = await readEmbeddedDrill(await requirePageIdentity(), slug);
  if (page === null) return null;
  const { drill, canRun } = page;
  return (
    <section
      aria-label={`Practice: ${drill.title}`}
      className="my-8 overflow-hidden rounded-card border border-border bg-background"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>Practice in the tool{drill.topic ? ` · ${drill.topic}` : ''}</Eyebrow>
          <h3 className="text-xl font-bold tracking-tight">{drill.title}</h3>
        </div>
        <Link href={ROUTES.drill(drill.publicId)} className="text-[13px] hover:underline">
          Open full screen →
        </Link>
      </header>
      <div className="px-6 pt-5">{renderBlocks(drill.brief)}</div>
      <div data-copyable="" className="border-t border-border">
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
    </section>
  );
}
