import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/ui/eyebrow';

/** The top of an admin tool page: label, heading and what the tool does. */
export function AdminToolHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <Eyebrow>Admin tool</Eyebrow>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-[14px] text-muted-foreground">{children}</p>
    </header>
  );
}
