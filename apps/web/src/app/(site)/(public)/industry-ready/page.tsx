import type { Metadata } from 'next';
import { findServices } from '@/db/services';
import { ServiceCard } from '@/features/industry-ready/components/service-card';
import { PageIntro } from '@/components/shared/page-intro';

export const metadata: Metadata = { title: 'Industry Ready' };

export default async function IndustryReadyPage() {
  const services = await findServices();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pb-20 pt-24">
      <PageIntro eyebrow="Industry Ready" title="Career services">
        Services for learners with active access. Each one opens here when it is ready.
      </PageIntro>
      <ul className="grid gap-4 sm:grid-cols-2">
        {services.map((service) => (
          <li key={service.slug}>
            <ServiceCard service={service} />
          </li>
        ))}
      </ul>
    </div>
  );
}
