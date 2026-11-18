import { cn } from '@/lib/cn';
import { FormalPanel } from './formal-panel';
import { SimulationPanel } from './simulation-panel';
import type { StateGraph } from './state-graph-engine';

const LEGEND = [
  { label: 'not yet visited', swatch: 'border-muted-foreground bg-background' },
  { label: 'visited / covered', swatch: 'border-info bg-info-light' },
  { label: 'hides a bug', swatch: 'border-dashed border-destructive bg-background' },
  { label: 'bug exposed', swatch: 'border-destructive bg-destructive/25' },
];

/** The state-graph lesson block: simulation and formal side by side over the same graph. */
export function StateGraphFigure({ graph }: { graph: StateGraph }) {
  return (
    <div
      role="group"
      aria-label={`${graph.simulationTitle} and ${graph.formalTitle}`}
      className="mb-6"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <SimulationPanel graph={graph} />
        <FormalPanel graph={graph} />
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        {LEGEND.map(({ label, swatch }) => (
          <span key={label} className="inline-flex items-center gap-1">
            <i className={cn('inline-block size-3 rounded-full border-[1.6px]', swatch)} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
