import type { Metadata } from 'next';
import { LEVELS } from '@siliconbox/shared';
import { Eyebrow } from '@/components/ui/eyebrow';
import { LevelCard } from '@/features/pricing/components/level-card';

export const metadata: Metadata = { title: 'Pricing' };

export default function PricingPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 pb-20 pt-24">
      <header className="flex max-w-2xl flex-col gap-4">
        <Eyebrow>Pricing</Eyebrow>
        <h1 className="text-5xl font-bold leading-[1.06] tracking-tighter">One price per level</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Prices are in Indian rupees. Upgrading while a lower level is still active costs only the
          difference. Every purchase starts a fresh formal-tool window.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-3">
        {LEVELS.map((level) => (
          <LevelCard key={level} level={level} />
        ))}
      </div>
      <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Purchases open at launch
      </p>
    </div>
  );
}
