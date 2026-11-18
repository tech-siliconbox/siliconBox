'use client';
import { Button } from '@/components/ui/button';
import { type StateGraph, bugStates } from './state-graph-engine';
import { StateGraphPanel } from './state-graph-panel';
import { StateGraphSvg } from './state-graph-svg';
import { SIMULATION_BATCH, useSimulation } from './use-simulation';

/** Constrained-random tests from reset: one animated, or a batch at once. */
export function SimulationPanel({ graph }: { graph: StateGraph }) {
  const { coverage, busy, runOne, runBatch, reset } = useSimulation(graph);
  const bugs = bugStates(graph);
  const found = [...bugs].filter((state) => coverage.visited.has(state)).length;
  const hiding = bugs.size - found;

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
      status={
        coverage.visited.size === 0 ? (
          'Press “Run 1 test” to apply one random test from reset.'
        ) : (
          <>
            Tests run: <b>{coverage.tests}</b> · States visited:{' '}
            <b>{`${coverage.visited.size} / ${graph.states.length}`}</b> · Bugs found:{' '}
            <b>{`${found} / ${bugs.size}`}</b>
            {hiding > 0 && (
              <span className="block font-semibold text-warning">
                {hiding} bug(s) still hiding in states no test has reached.
              </span>
            )}
          </>
        )
      }
    />
  );
}
