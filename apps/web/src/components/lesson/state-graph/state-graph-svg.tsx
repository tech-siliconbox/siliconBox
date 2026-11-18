import { useId } from 'react';
import { cn } from '@/lib/cn';
import { type Edge, type StateGraph, edgeKey } from './state-graph-engine';

const RADIUS = 18;
const MARGIN = 40;

type Highlight = 'idle' | 'used' | 'trace';
type State = StateGraph['states'][number];

const EDGE_CLASS: Record<Highlight, string> = {
  idle: 'stroke-muted-foreground/40 [stroke-width:1.6]',
  used: 'stroke-info [stroke-width:2.6]',
  trace: 'stroke-destructive [stroke-width:3.4]',
};
const ARROW_CLASS: Record<Highlight, string> = {
  idle: 'fill-muted-foreground/40',
  used: 'fill-info',
  trace: 'fill-destructive',
};
const HIGHLIGHTS = Object.keys(ARROW_CLASS) as Highlight[];

function Arrowheads({ id }: { id: string }) {
  return (
    <defs>
      {HIGHLIGHTS.map((kind) => (
        <marker
          key={kind}
          id={`${id}-${kind}`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="9"
          markerHeight="9"
          markerUnits="userSpaceOnUse"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" className={ARROW_CLASS[kind]} />
        </marker>
      ))}
    </defs>
  );
}

/** A transition drawn from circle edge to circle edge. */
function Transition({
  from,
  to,
  kind,
  id,
}: {
  from: State;
  to: State;
  kind: Highlight;
  id: string;
}) {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const [ux, uy] = [(to.x - from.x) / length, (to.y - from.y) / length];
  return (
    <line
      x1={from.x + ux * RADIUS}
      y1={from.y + uy * RADIUS}
      x2={to.x - ux * (RADIUS + 3)}
      y2={to.y - uy * (RADIUS + 3)}
      className={EDGE_CLASS[kind]}
      markerEnd={`url(#${id}-${kind})`}
    />
  );
}

function StateNode({ state, seen }: { state: State; seen: boolean }) {
  const hit = seen && state.hidesBug;
  const label = (dy: number, className: string, text: string) => (
    <text x={state.x} y={state.y + dy} textAnchor="middle" className={className}>
      {text}
    </text>
  );
  return (
    <g>
      <circle
        cx={state.x}
        cy={state.y}
        r={RADIUS}
        className={cn(
          'fill-background stroke-muted-foreground [stroke-width:1.6]',
          state.hidesBug && 'stroke-destructive [stroke-dasharray:3_2]',
          seen && 'fill-info-light stroke-info [stroke-dasharray:none]',
          hit && 'fill-destructive/25 stroke-destructive [stroke-width:2.4]',
        )}
      />
      {label(4, 'fill-foreground text-[11px] font-semibold', state.label)}
      {state.hidesBug &&
        label(
          -RADIUS - 5,
          cn('fill-destructive text-[9px] font-bold', !hit && 'opacity-60'),
          'bug',
        )}
      {state.note && label(RADIUS + 13, 'fill-muted-foreground text-[9px]', state.note)}
    </g>
  );
}

type StateGraphSvgProps = {
  graph: StateGraph;
  visited: ReadonlySet<string>;
  used: ReadonlySet<Edge>;
  trace?: ReadonlySet<Edge>;
  label: string;
};

/** Draws the lesson's state graph with visited states and taken transitions highlighted. */
export function StateGraphSvg({ graph, visited, used, trace, label }: StateGraphSvgProps) {
  const id = useId();
  const position = new Map(graph.states.map((state) => [state.label, state]));
  const width = Math.max(...graph.states.map((state) => state.x)) + MARGIN;
  const height = Math.max(...graph.states.map((state) => state.y)) + MARGIN;
  const highlight = (edge: Edge): Highlight =>
    trace?.has(edge) ? 'trace' : used.has(edge) ? 'used' : 'idle';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="h-auto w-full rounded border border-border bg-muted"
    >
      <Arrowheads id={id} />
      {graph.transitions.map(({ from, to }) => {
        const [a, b] = [position.get(from), position.get(to)];
        const key = edgeKey(from, to);
        return a && b ? (
          <Transition key={key} from={a} to={b} kind={highlight(key)} id={id} />
        ) : null;
      })}
      {graph.states.map((state) => (
        <StateNode key={state.label} state={state} seen={visited.has(state.label)} />
      ))}
    </svg>
  );
}
