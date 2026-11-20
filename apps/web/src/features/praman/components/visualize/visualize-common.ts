import type { WhatIf } from '../../hooks/use-visualize';
import type { Reset } from '../../praman-snapshot';
import type { PramanTrace } from '../../praman-trace';
import type { TraceAnalysis } from '../../trace-tools';
import type { Cycles } from '../../visualize';

// What the parts of the Visualize window share: the trace they show, the details' tabs and the
// signal they ask about, and the look of a tool button.

export type BodyProps = {
  trace: PramanTrace;
  cycles: Cycles;
  top: string;
  reset: Reset | null;
  analysis?: TraceAnalysis;
  whatIf: WhatIf;
};

export type DetailTab = 'why' | 'drivers' | 'diagram';

/** A signal at a cycle: what drove it there is what the drivers tabs show. */
export type DriverQuery = { signal: string; cycle: number };

export const TOOL =
  'h-7 rounded-[3px] border border-border bg-background px-2 text-[12px] enabled:hover:bg-muted disabled:text-muted-foreground';
