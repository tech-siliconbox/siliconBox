import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

type LockedCardProps = { title: string; reason: string; action?: ReactNode };

/** A locked level or service: says why, never a dead link. */
export function LockedCard({ title, reason, action }: LockedCardProps) {
  return (
    <Card aria-disabled="true" className="flex flex-col gap-3 bg-muted">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        <Badge>Locked</Badge>
      </div>
      <p className="text-sm text-muted-foreground">{reason}</p>
      {action}
    </Card>
  );
}
