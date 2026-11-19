import { type ReactNode, useId } from 'react';

type PanelFrameProps = { title: string; description?: string; children: ReactNode };

/** A bordered panel in the career tools: a heading, an optional sentence, then its content. */
export function PanelFrame({ title, description, children }: PanelFrameProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-card border border-border p-6"
    >
      <div className="flex flex-col gap-1">
        <h2 id={headingId} className="text-base font-bold tracking-tight">
          {title}
        </h2>
        {description !== undefined && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}
