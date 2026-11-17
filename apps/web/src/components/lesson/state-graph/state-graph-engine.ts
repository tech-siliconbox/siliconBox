import type { LessonBlock } from '@siliconbox/shared';

// Pure rules behind the state-graph block. The graph itself comes from the lesson (the CMS);
// nothing here knows about any particular design.

export type StateGraph = Extract<LessonBlock, { blockType: 'stateGraph' }>;
export type Edge = `${string}>${string}`;

export const edgeKey = (from: string, to: string): Edge => `${from}>${to}`;

const resetState = (graph: StateGraph): string => graph.states[0]?.label ?? '';

export const bugStates = (graph: StateGraph): Set<string> =>
  new Set(graph.states.filter((state) => state.hidesBug).map((state) => state.label));

/** One random step: each transition by its chance; whatever chance is left returns to reset. */
function step(graph: StateGraph, from: string, roll: number): string {
  let total = 0;
  for (const transition of graph.transitions) {
    if (transition.from !== from) continue;
    total += transition.chance;
    if (roll < total) return transition.to;
  }
  return resetState(graph);
}

/** The states one random test visits, starting at reset, `testLength` cycles long. */
export function randomTest(graph: StateGraph, random: () => number): string[] {
  const path = [resetState(graph)];
  for (let cycle = 0; cycle < graph.testLength; cycle += 1) {
    path.push(step(graph, path.at(-1) ?? resetState(graph), random()));
  }
  return path;
}

export type Exploration = {
  /** States reached at each cycle depth, in breadth-first order. */
  layers: string[][];
  /** How each state was first reached, for the shortest trace. */
  parent: Map<string, string>;
};

const successors = (graph: StateGraph, from: string): string[] =>
  graph.transitions.filter((transition) => transition.from === from).map(({ to }) => to);

/** Breadth-first search from reset: what a formal tool covers, one cycle depth at a time. */
export function explore(graph: StateGraph): Exploration {
  const start = resetState(graph);
  const parent = new Map<string, string>();
  const seen = new Set([start]);
  const layers = [[start]];
  for (let frontier = [start]; frontier.length > 0;) {
    const next: string[] = [];
    for (const from of frontier) {
      const fresh = successors(graph, from).filter((to) => !seen.has(to));
      for (const to of fresh) {
        seen.add(to);
        parent.set(to, from);
      }
      next.push(...fresh);
    }
    if (next.length > 0) layers.push(next);
    frontier = next;
  }
  return { layers, parent };
}

/** Shortest path from reset to `target`, following the search's parents. */
export function shortestTrace(parent: Map<string, string>, target: string): string[] {
  const trace = [target];
  for (let state = parent.get(target); state !== undefined; state = parent.get(state)) {
    trace.unshift(state);
  }
  return trace;
}

/** Edge keys along a path of states. */
export const pathEdges = (path: string[]): Edge[] =>
  path.slice(1).map((to, index) => edgeKey(path[index] ?? '', to));
