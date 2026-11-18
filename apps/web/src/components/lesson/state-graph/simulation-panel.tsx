'use client';
import { Button } from '@/components/ui/button';
import { type StateGraph, bugStates } from './state-graph-engine';
import { StateGraphPanel } from './state-graph-panel';
import { StateGraphSvg } from './state-graph-svg';
import { SIMULATION_BATCH, useSimulation } from './use-simulation';

type Coverage = ReturnType<typeof useSimulation>['coverage'];

/** The status line, worded as in the course's own figure. */
function SimulationStatus({ graph, coverage }: { graph: StateGraph; coverage: Coverage }) {
  const bugs = bugStates(graph);
  const found = [...bugs].filter((state) => coverage.visited.has(state)).length;
  const hiding = bugs.size - found;
  if (coverage.visited.size === 0) {
    return (
      <>
        Press <b>Run 1 test</b> to apply one constrained-random test from reset.
      </>
    );
  }
  return (
    <>
      Tests run: <b>{coverage.tests}</b> | States visited:{' '}
      <b>{`${coverage.visited.size} / ${graph.states.length}`}</b> | Bugs found:{' '}
      <b>{`${found} / ${bugs.size}`}</b>
      {hiding > 0 && coverage.tests > 0 && (
        <span className="block font-semibold text-warning">
          {hiding} bug(s) still hiding in states no test has reached.
        </span>
      )}
      {hiding === 0 && (
        <span className="block">
          Lucky! {bugs.size === 2 ? 'Both bugs were' : 'All bugs were'} found. Press Reset and try
          again to see how often that happens.
        </span>
      )}
    </>
  );
}

/** Constrained-random tests from reset: one animated, or a batch at once. */
export function SimulationPanel({ graph }: { graph: StateGraph }) {
  const { coverage, busy, runOne, runBatch, reset } = useSimulation(graph);
  return (
    <StateGraphPanel
      title={graph.simulationTitle}
      text={graph.simulationText}
      graph={
        <StateGraphSvg
          graph={graph}
          visited={coverage.visited}
          used={coverage.used}
          label={graph.simulationTitle}
        />
      }
      controls={
        <>
          <Button size="sm" disabled={busy} onClick={runOne}>
            Run 1 test
          </Button>
          <Button size="sm" disabled={busy} onClick={runBatch}>
            Run {SIMULATION_BATCH} tests
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={reset}>
            Reset
          </Button>
        </>
      }
      status={<SimulationStatus graph={graph} coverage={coverage} />}
    />
  );
}
