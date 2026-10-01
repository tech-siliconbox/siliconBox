import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

type AuthPanelProps = { title: string; notice?: ReactNode; footer: ReactNode; children: ReactNode };

/** The centred card that frames the sign-in and sign-up pages. */
export function AuthPanel({ title, notice, footer, children }: AuthPanelProps) {
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-6 pb-20 pt-16">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {notice}
      <Card className="flex flex-col gap-4">{children}</Card>
      <p className="text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}
