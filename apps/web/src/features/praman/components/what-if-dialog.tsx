'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Pin } from '../trace-tools';
import { Choice } from './choice';
import { SMALL_CONTROL } from './small-control';
import { ToolDialog } from './tool-dialog';

type WhatIfDialogProps = {
  /** The trace's signals, by their full names. */
  signals: string[];
  /** The trace shown came from a what-if: another trace may be asked to differ from it. */
  canDiffer: boolean;
  onRun: (pins: Pin[], differ: boolean) => void;
  onClose: () => void;
};

/** Pins values on the trace ("what if en were 0 in cycle 6?") and proves the property again. */
export function WhatIfDialog({ signals, canDiffer, onRun, onClose }: WhatIfDialogProps) {
  const fresh = (): Pin => ({ signal: signals[0] ?? '', cycle: 0, value: '0' });
  const [pins, setPins] = useState<Pin[]>([fresh()]);
  const [differ, setDiffer] = useState(false);
  const ready = pins.every((pin) => pin.signal !== '' && pin.value.trim() !== '') || differ;
  return (
    <ToolDialog title="What If" onClose={onClose}>
      <p className="mb-3">
        Praman proves the property again with these values held, and shows the new trace, or why
        there is none.
      </p>
      <div className="flex flex-col gap-2">
        <PinList pins={pins} signals={signals} fresh={fresh} onChange={setPins} />
        {canDiffer && (
          <Choice type="checkbox" checked={differ} onChange={setDiffer}>
            Other inputs than the trace shown
          </Choice>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!ready}
          onClick={() => {
            onRun(pins, differ);
            onClose();
          }}
        >
          Prove
        </Button>
      </div>
    </ToolDialog>
  );
}

type PinListProps = {
  pins: Pin[];
  signals: string[];
  fresh: () => Pin;
  onChange: (pins: Pin[]) => void;
};

/** The values to hold, each removable, and one more on request. */
function PinList({ pins, signals, fresh, onChange }: PinListProps) {
  const change = (index: number, pin: Partial<Pin>) =>
    onChange(pins.map((each, at) => (at === index ? { ...each, ...pin } : each)));
  return (
    <>
      {pins.map((pin, index) => (
        <PinRow
          key={index}
          pin={pin}
          signals={signals}
          onChange={(changed) => change(index, changed)}
          onRemove={() => onChange(pins.filter((_, at) => at !== index))}
        />
      ))}
      <button
        type="button"
        onClick={() => onChange([...pins, fresh()])}
        className="self-start text-[12px] font-semibold underline underline-offset-2"
      >
        Add a value
      </button>
    </>
  );
}

type PinRowProps = {
  pin: Pin;
  signals: string[];
  onChange: (pin: Partial<Pin>) => void;
  onRemove: () => void;
};

/** One value to hold: the signal, the cycle and the value. */
function PinRow({ pin, signals, onChange, onRemove }: PinRowProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Signal"
        value={pin.signal}
        onChange={(e) => onChange({ signal: e.target.value })}
        className={`${SMALL_CONTROL} min-w-0 flex-1`}
      >
        {signals.map((signal) => (
          <option key={signal}>{signal}</option>
        ))}
      </select>
      <span>at cycle</span>
      <input
        aria-label="Cycle"
        type="number"
        min={0}
        max={200}
        value={pin.cycle}
        onChange={(e) => onChange({ cycle: Number(e.target.value) })}
        className={`${SMALL_CONTROL} w-16`}
      />
      <span>is</span>
      <input
        aria-label="Value"
        value={pin.value}
        onChange={(e) => onChange({ value: e.target.value })}
        className={`${SMALL_CONTROL} w-24`}
      />
      <button
        type="button"
        aria-label="Remove this value"
        onClick={onRemove}
        className="px-1 text-muted-foreground hover:text-danger"
      >
        ×
      </button>
    </div>
  );
}
