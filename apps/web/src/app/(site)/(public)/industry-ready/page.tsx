import type { PublicService } from '@siliconbox/shared';
import type { Metadata } from 'next';
import { PageIntro } from '@/components/shared/page-intro';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { cn } from '@/lib/cn';
import { findServices } from '@/db/services';
import { ServiceCard } from '@/features/industry-ready/components/service-card';
import { PAGE_SPACING } from '@/components/shared/page-shell';

export const metadata: Metadata = { title: 'Industry Ready' };

/** Columns that leave no card alone on a row: three across for 3, 5, 6…; two across for 2, 4. */
function columnsFor(count: number): string {
  if (count <= 1) return '';
  return count % 2 === 0 && count % 3 !== 0 ? 'sm:grid-cols-2' : 'md:grid-cols-3';
}

function ServiceGroup({ title, services }: { title: string; services: PublicService[] }) {
  if (services.length === 0) return null;
  return (
    <section aria-labelledby={`group-${title}`} className="flex flex-col gap-4">
      <h2 id={`group-${title}`} className={EYEBROW_CLASS}>
        {title}
      </h2>
      <ul className={cn('grid gap-4', columnsFor(services.length))}>
        {services.map((service) => (
          <li key={service.slug}>
            <ServiceCard service={service} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function IndustryReadyPage() {
  const services = await findServices();
  return (
    <div className={`mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 ${PAGE_SPACING}`}>
      <PageIntro eyebrow="Industry Ready" title="Career services">
        Services for learners with active access. Each one opens here when it is ready.
      </PageIntro>
      <ServiceGroup title="Open now" services={services.filter((s) => s.status === 'open')} />
      <ServiceGroup title="Coming soon" services={services.filter((s) => s.status === 'locked')} />
    </div>
  );
}
