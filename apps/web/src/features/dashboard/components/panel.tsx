import { slugify } from '@siliconbox/shared';
import type { ReactNode } from 'react';
import { EYEBROW_CLASS } from '@/components/ui/eyebrow';

type PanelProps = { title: string; count?: string; children: ReactNode };

/** A bordered section: a heading row (with an optional count on the right), then its content. */
export function Panel({ title, count, children }: PanelProps) {
  const id = `panel-${slugify(title)}`;
  return (
    <section aria-labelledby={id} className="rounded-card border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 id={id} className={EYEBROW_CLASS}>
          {title}
        </h2>
        {count !== undefined && <span className={EYEBROW_CLASS}>{count}</span>}
      </div>
      {children}
    </section>
  );
}
