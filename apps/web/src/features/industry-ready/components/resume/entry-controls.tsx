'use client';

import { Button } from '@/components/ui/button';

type EntryControlsProps = {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  /** Left out for an entry that cannot be removed, such as a built-in section. */
  onRemove?: (() => void) | undefined;
};

/** Move up, move down and remove, named for screen readers. */
export function EntryControls({ name, first, last, onMove, onRemove }: EntryControlsProps) {
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={first}
        onClick={() => onMove(-1)}
        aria-label={`Move ${name} up`}
      >
        ↑
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={last}
        onClick={() => onMove(1)}
        aria-label={`Move ${name} down`}
      >
        ↓
      </Button>
      {onRemove !== undefined && (
        <Button size="sm" variant="secondary" onClick={onRemove} aria-label={`Remove ${name}`}>
          Remove
        </Button>
      )}
    </div>
  );
}
