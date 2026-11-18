import type { Metadata } from 'next';
import { LEVELS } from '@siliconbox/shared';
import { LevelCard } from '@/features/pricing/components/level-card';
import { PageIntro } from '@/components/shared/page-intro';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6">
      <PageIntro eyebrow="Pricing" title="One price per level">
        Prices are in Indian rupees. Upgrading while a lower level is still active costs only the
        difference. Every purchase starts a fresh formal-tool window. Purchases open at launch.
      </PageIntro>
      <div className="grid gap-6 md:grid-cols-3">
        {LEVELS.map((level) => (
          <LevelCard key={level} level={level} />
        ))}
      </div>
    </div>
  );
}
