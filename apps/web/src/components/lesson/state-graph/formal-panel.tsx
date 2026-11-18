'use client';
import { Button } from '@/components/ui/button';
import { type StateGraph, bugStates } from './state-graph-engine';
import { StateGraphPanel } from './state-graph-panel';
import { StateGraphSvg } from './state-graph-svg';
import { useExploration } from './use-exploration';

type FormalStatusProps = {
  graph: StateGraph;
  exploration: ReturnType<typeof useExploration>;
  bugs: number;
};

/** The status line, worded as in the course's own figure. */
function FormalStatus({ graph, exploration, bugs }: FormalStatusProps) {
  const { depth, visited, trace, found } = exploration;
  const covered = `${visited.size} / ${graph.states.length}`;
  if (depth < 0) {
    return (
      <>
        Press <b>Run formal</b> to explore all states, one cycle depth at a time.
      </>
    );
  }
  if (trace.length > 0) {
    return (
      <>
        Every reachable state covered: <b>{covered}</b> | Bugs found: <b>{`${found} / ${bugs}`}</b>
        <span className="block">
          Counterexample for the deep bug (shortest trace, {trace.length - 1} cycles):{' '}
          {trace.join(' → ')}
        </span>
      </>
    );
  }
  return (
    <>
      Cycle depth: <b>{depth}</b> | States covered: <b>{covered}</b> | Bugs found:{' '}
      <b>{`${found} / ${bugs}`}</b>
    </>
  );
}

/** Breadth-first exploration from reset, one cycle depth at a time, then the shortest trace. */
export function FormalPanel({ graph }: { graph: StateGraph }) {
  const bugs = bugStates(graph);
  const exploration = useExploration(graph, bugs);
  const { visited, used, traceEdges, run, reset } = exploration;

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
      status={<FormalStatus graph={graph} exploration={exploration} bugs={bugs.size} />}
    />
  );
}
