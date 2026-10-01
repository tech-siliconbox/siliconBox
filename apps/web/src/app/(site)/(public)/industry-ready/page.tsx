import type { Metadata } from 'next';
import { Eyebrow } from '@/components/ui/eyebrow';
import { findServices } from '@/db/services';
import { ServiceCard } from '@/features/industry-ready/components/service-card';

export const metadata: Metadata = { title: 'Industry Ready' };

export default async function IndustryReadyPage() {
  const services = await findServices();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 pb-20 pt-24">
      <header className="flex flex-col gap-4">
        <Eyebrow>Industry Ready</Eyebrow>
        <h1 className="text-5xl font-bold leading-[1.06] tracking-tighter">Career services</h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Services for learners with active access. Each one opens here when it is ready.
        </p>
      </header>
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
