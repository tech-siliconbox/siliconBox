'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

type ListEditorProps<T> = {
  label: string;
  items: T[];
  onChange: (items: T[]) => void;
  create: () => T;
  max: number;
  render: (item: T, set: (patch: Partial<T>) => void) => ReactNode;
};

/** Add, remove and reorder entries of one resume section. */
export function ListEditor<T>({ label, items, onChange, create, max, render }: ListEditorProps<T>) {
  const replace = (index: number, item: T) =>
    onChange(items.map((old, i) => (i === index ? item : old)));
  const move = (index: number, by: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    if (item !== undefined) next.splice(index + by, 0, item);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-4">
      {items.map((item, index) => (
        <fieldset key={index} className="flex flex-col gap-3 rounded-md border border-border p-4">
          <legend className="px-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {label} {index + 1}
          </legend>
          {render(item, (patch) => replace(index, { ...item, ...patch }))}
          <EntryControls
            name={`${label} ${index + 1}`}
            first={index === 0}
            last={index === items.length - 1}
            onMove={(by) => move(index, by)}
            onRemove={() => onChange(items.filter((_, i) => i !== index))}
          />
        </fieldset>
      ))}
      {items.length < max && (
        <Button
          size="sm"
          variant="secondary"
          className="w-fit"
          onClick={() => onChange([...items, create()])}
        >
          + Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  );
}

type EntryControlsProps = {
  name: string;
  first: boolean;
  last: boolean;
  onMove: (by: number) => void;
  onRemove: () => void;
};

function EntryControls({ name, first, last, onMove, onRemove }: EntryControlsProps) {
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
      <Button size="sm" variant="secondary" onClick={onRemove} aria-label={`Remove ${name}`}>
        Remove
      </Button>
    </div>
  );
}
