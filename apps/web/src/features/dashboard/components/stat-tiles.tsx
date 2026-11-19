import { EYEBROW_CLASS } from '@/components/ui/eyebrow';

type Tile = { label: string; value: number; of?: number };

/** A row of numbers with their labels, one equal column each; stacked on phones. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-card border border-border bg-border sm:auto-cols-fr sm:grid-flow-col">
      {tiles.map(({ label, value, of }) => (
        <div key={label} className="flex flex-col gap-2 bg-background px-5 py-4">
          <dt className={EYEBROW_CLASS}>{label}</dt>
          <dd className="font-mono text-2xl font-semibold">
            {value}
            {of !== undefined && (
              <span className="text-sm font-normal text-muted-foreground"> / {of}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
