'use client';
import { useState } from 'react';
import { type Edge, type StateGraph, pathEdges, randomTest } from './state-graph-engine';
import { useTimer } from './use-timer';

const STEP_MS = 140;
export const SIMULATION_BATCH = 1000;

type Coverage = { tests: number; visited: Set<string>; used: Set<Edge> };
const EMPTY: Coverage = { tests: 0, visited: new Set(), used: new Set() };

function addPaths(coverage: Coverage, paths: string[][], finished: number): Coverage {
  return {
    tests: coverage.tests + finished,
    visited: new Set([...coverage.visited, ...paths.flat()]),
    used: new Set([...coverage.used, ...paths.flatMap(pathEdges)]),
  };
}

/** Random tests from reset: one shown step by step, or a whole batch at once. */
export function useSimulation(graph: StateGraph) {
  const [coverage, setCoverage] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const timer = useTimer();

  const runOne = () => {
    const path = randomTest(graph, Math.random);
    setBusy(true);
    const show = (shown: number) => {
      const done = shown >= path.length;
      setCoverage((current) => addPaths(current, [path.slice(0, shown)], done ? 1 : 0));
      if (done) setBusy(false);
      else timer.schedule(() => show(shown + 1), STEP_MS);
    };
    show(1);
  };
  const runBatch = () => {
    const paths = Array.from({ length: SIMULATION_BATCH }, () => randomTest(graph, Math.random));
    setCoverage((current) => addPaths(current, paths, paths.length));
  };
  return { coverage, busy, runOne, runBatch, reset: () => setCoverage(EMPTY) };
}
