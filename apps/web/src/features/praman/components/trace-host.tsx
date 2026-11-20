'use client';

import { type ReactNode, useState } from 'react';
import type { TraceAnalysis } from '../hooks/use-trace-tools';
import { TracePanel } from './trace-panel';

/** A trace to open under a result panel: where to read it, its title, and its tools. */
export type OpenTrace = { url: string; title: string; analysis?: TraceAnalysis };

/** Shows a result panel, and the trace it opened under it. */
export function TraceHost({
  children,
}: {
  children: (open: (trace: OpenTrace) => void) => ReactNode;
}) {
  const [trace, setTrace] = useState<OpenTrace | null>(null);
  return (
    <>
      {children(setTrace)}
      {trace !== null && <TracePanel key={trace.url} {...trace} onClose={() => setTrace(null)} />}
    </>
  );
}
