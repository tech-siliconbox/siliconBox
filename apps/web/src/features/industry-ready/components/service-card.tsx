import { type PublicService, ROUTES } from '@siliconbox/shared';
import Link from 'next/link';
import { LockedCard } from '@/components/shared/locked-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

/**
 * Pages for open services, added as each service is built. An open service without a page here
 * shows no link, so a card never leads nowhere.
 */
const SERVICE_PAGES: Readonly<Record<string, string>> = {
  'resume-builder': ROUTES.resumeBuilder,
  'cv-screening': ROUTES.cvScreening,
};

export function ServiceCard({ service }: { service: PublicService }) {
  if (service.status === 'locked') {
    return (
      <LockedCard
        title={service.title}
        reason={[service.summary, service.lockedReason].filter(Boolean).join(' · ')}
      />
    );
  }
  const page = SERVICE_PAGES[service.slug];
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold tracking-tight">{service.title}</h3>
        <Badge variant="inverted">Open</Badge>
      </div>
      {service.summary && <p className="text-sm text-muted-foreground">{service.summary}</p>}
      {page !== undefined && (
        <Link href={page} className="text-sm underline underline-offset-4">
          Open {service.title}
        </Link>
      )}
    </Card>
  );
}
