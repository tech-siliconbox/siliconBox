'use client';
import { Button } from '@/components/ui/button';
import { type StateGraph, bugStates } from './state-graph-engine';
import { StateGraphPanel } from './state-graph-panel';
import { StateGraphSvg } from './state-graph-svg';
import { useExploration } from './use-exploration';

/** Breadth-first exploration from reset, one cycle depth at a time, then the shortest trace. */
export function FormalPanel({ graph }: { graph: StateGraph }) {
  const bugs = bugStates(graph);
  const { depth, visited, used, traceEdges, trace, found, run, reset } = useExploration(
    graph,
    bugs,
  );

  return (
    <StateGraphPanel
      title={graph.formalTitle}
      text={graph.formalText}
      graph={
        <StateGraphSvg
          graph={graph}
          visited={visited}
          used={used}
          trace={traceEdges}
          label={graph.formalTitle}
        />
      }
      controls={
        <>
          <Button size="sm" onClick={run}>
            Run formal
          </Button>
          <Button size="sm" variant="secondary" onClick={reset}>
            Reset
          </Button>
        </>
      }
      status={
        depth < 0 ? (
          'Press “Run formal” to explore every state, one cycle depth at a time.'
        ) : (
          <>
            Cycle depth: <b>{depth}</b> · States covered:{' '}
            <b>{`${visited.size} / ${graph.states.length}`}</b> · Bugs found:{' '}
            <b>{`${found} / ${bugs.size}`}</b>
            {trace.length > 0 && (
              <span className="block">
                Shortest counterexample ({trace.length - 1} cycles): {trace.join(' → ')}
              </span>
            )}
          </>
        )
      }
    />
  );
}
