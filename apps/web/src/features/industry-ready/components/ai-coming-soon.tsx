import { Badge } from '@/components/ui/badge';

/** In place of an AI feature until it is switched on (ADR 0030); the tool works without it. */
export function AiComingSoon({ feature }: { feature: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed border-border p-4">
      <Badge variant="muted">Coming soon</Badge>
      <p className="text-sm text-muted-foreground">
        {feature} with AI is coming soon. Everything else here works now.
      </p>
    </div>
  );
}
