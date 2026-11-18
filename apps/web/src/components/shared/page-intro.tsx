import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/ui/eyebrow';

type PageIntroProps = { eyebrow: string; title: string; children?: ReactNode };

/** The top of a section page: a small label, the heading and a sentence or two. */
export function PageIntro({ eyebrow, title, children }: PageIntroProps) {
  return (
    <header className="flex max-w-2xl flex-col gap-4">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-4xl font-bold leading-[1.06] tracking-tighter">{title}</h1>
      {children && <p className="text-base leading-relaxed text-muted-foreground">{children}</p>}
    </header>
  );
}
