'use client';

import { type ReactNode, useState } from 'react';
import type { TraceAnalysis } from '../trace-tools';
import { type Reset, VisualizeWindow } from './visualize/visualize-window';

/** A trace to open in Visualize: where to read it, its title, and what its tools may ask. */
export type OpenTrace = { url: string; title: string; analysis?: TraceAnalysis };

type TraceHostProps = {
  /** The design's top module and reset: the rows shown first, and the cycles the reset holds. */
  top: string;
  reset: Reset | null;
  children: (open: (trace: OpenTrace) => void) => ReactNode;
};

/** Shows a result panel, and opens a trace it asks for in Visualize. */
export function TraceHost({ top, reset, children }: TraceHostProps) {
  const [trace, setTrace] = useState<OpenTrace | null>(null);
  return (
    <>
      {children(setTrace)}
      {trace !== null && (
        <VisualizeWindow
          key={trace.url}
          {...trace}
          top={top}
          reset={reset}
          onClose={() => setTrace(null)}
        />
      )}
    </>
  );
}
