'use client';
import { useMemo, useState } from 'react';
import { type StateGraph, edgeKey, explore, pathEdges, shortestTrace } from './state-graph-engine';
import { useTimer } from './use-timer';

const LAYER_MS = 750;

/** Formal exploration shown one cycle depth at a time, ending with the shortest trace. */
export function useExploration(graph: StateGraph, bugs: ReadonlySet<string>) {
  const { layers, parent } = useMemo(() => explore(graph), [graph]);
  const [depth, setDepth] = useState(-1);
  const timer = useTimer();

  const reached = layers.slice(0, depth + 1).flat();
  const used = reached.flatMap((state) => {
    const from = parent.get(state);
    return from === undefined ? [] : [edgeKey(from, state)];
  });
  const found = reached.filter((state) => bugs.has(state));
  const deepest = found.at(-1);
  const trace =
    depth === layers.length - 1 && deepest !== undefined ? shortestTrace(parent, deepest) : [];

  const run = () => {
    const show = (next: number) => {
      setDepth(next);
      if (next < layers.length - 1) timer.schedule(() => show(next + 1), LAYER_MS);
    };
    show(0);
  };
  const reset = () => {
    timer.stop();
    setDepth(-1);
  };
  return {
    depth,
    visited: new Set(reached),
    used: new Set(used),
    traceEdges: new Set(pathEdges(trace)),
    trace,
    found: found.length,
    run,
    reset,
  };
}
