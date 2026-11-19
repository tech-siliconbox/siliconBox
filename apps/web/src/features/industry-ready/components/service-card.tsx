import { type PublicService, ROUTES } from '@siliconbox/shared';
import { LockedCard } from '@/components/shared/locked-card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';
import { SiteLink } from '@/components/ui/site-link';

/**
 * Pages for open services, added as each service is built. An open service without a page here
 * shows no link, so a card never leads nowhere.
 */
const SERVICE_PAGES: Readonly<Record<string, string>> = {
  'resume-builder': ROUTES.resumeBuilder,
  'cv-screening': ROUTES.cvScreening,
};

/** A service as a card that fills its grid cell, so cards in a row match; its action sits at the bottom. */
export function ServiceCard({ service }: { service: PublicService }) {
  if (service.status === 'locked') {
    const note = service.lockedReason ? (
      <p className={EYEBROW_CLASS}>{service.lockedReason}</p>
    ) : undefined;
    return <LockedCard title={service.title} reason={service.summary ?? ''} action={note} />;
  }
  const page = SERVICE_PAGES[service.slug];
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-bold tracking-tight">{service.title}</h3>
        <Badge className="mt-0.5 shrink-0" variant="inverted">
          Open
        </Badge>
      </div>
      {service.summary && <p className="text-sm text-muted-foreground">{service.summary}</p>}
      {page !== undefined && (
        <SiteLink href={page} className={`${buttonVariants({ size: 'sm' })} mt-auto w-fit`}>
          Open {service.title}
        </SiteLink>
      )}
    </Card>
  );
}
