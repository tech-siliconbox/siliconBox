'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { TraceTools } from '../hooks/use-trace-tools';
import { SMALL_CONTROL } from './small-control';
import { WhatIfDialog } from './what-if-dialog';

type TraceToolbarProps = {
  /** The trace's signals, by their full names. */
  signals: string[];
  tools: TraceTools;
  /** Only a property's trace can be proven again with values pinned. */
  whatIf: boolean;
};

/** The waveform's tools: the quietest trace, what if, and what drove a signal at a cycle. */
export function TraceToolbar({ signals, tools, whatIf }: TraceToolbarProps) {
  return (
    <div role="toolbar" aria-label="Trace tools" className="flex flex-wrap items-center gap-2">
      {whatIf && <WhatIfTools signals={signals} tools={tools} />}
      {tools.found !== null && (
        <Button size="sm" variant="secondary" onClick={tools.original}>
          Original Trace
        </Button>
      )}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
      <DriversForm signals={signals} tools={tools} />
    </div>
  );
}

function WhatIfTools({ signals, tools }: Omit<TraceToolbarProps, 'whatIf'>) {
  const [pinning, setPinning] = useState(false);
  const differFrom = tools.found?.job ?? '';
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => void tools.whatIf({ quiet: true }, 'quietest trace')}
      >
        Quiet Trace
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setPinning(true)}>
        What If…
      </Button>
      {pinning && (
        <WhatIfDialog
          signals={signals}
          canDiffer={differFrom !== ''}
          onRun={(pins, differ) =>
            void tools.whatIf(
              { pins, ...(differ ? { differFrom } : {}) },
              pins.map((pin) => `${pin.signal} = ${pin.value} @${pin.cycle}`).join(', '),
            )
          }
          onClose={() => setPinning(false)}
        />
      )}
    </>
  );
}

function DriversForm({ signals, tools }: Omit<TraceToolbarProps, 'whatIf'>) {
  const [signal, setSignal] = useState(signals[0] ?? '');
  const [cycle, setCycle] = useState(0);
  return (
    <>
      <select
        aria-label="Drivers of"
        value={signal}
        onChange={(e) => setSignal(e.target.value)}
        className={`${SMALL_CONTROL} max-w-56`}
      >
        {signals.map((each) => (
          <option key={each}>{each}</option>
        ))}
      </select>
      <input
        aria-label="At cycle"
        type="number"
        min={0}
        max={200}
        value={cycle}
        onChange={(e) => setCycle(Number(e.target.value))}
        className={`${SMALL_CONTROL} w-16`}
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={signal === ''}
        onClick={() => void tools.showDrivers(signal, cycle)}
      >
        Drivers
      </Button>
    </>
  );
}
