import { describe, expect, it } from 'vitest';
import {
  type StateGraph,
  bugStates,
  explore,
  pathEdges,
  randomTest,
  shortestTrace,
} from './state-graph-engine';

const graph: StateGraph = {
  blockType: 'stateGraph',
  simulationTitle: 'Invented simulation',
  simulationText: 'Invented text.',
  formalTitle: 'Invented formal',
  formalText: 'Invented text.',
  testLength: 3,
  states: [
    { label: 'A', x: 0, y: 0 },
    { label: 'B', x: 10, y: 0 },
    { label: 'C', x: 20, y: 0 },
    { label: 'D', x: 30, y: 0, hidesBug: true },
  ],
  transitions: [
    { from: 'A', to: 'B', chance: 0.5 },
    { from: 'A', to: 'C', chance: 0.5 },
    { from: 'B', to: 'D', chance: 0.1 },
    { from: 'C', to: 'D', chance: 0.1 },
  ],
};

describe('state graph engine', () => {
  it('walks one transition per cycle from reset', () => {
    const rolls = [0.2, 0.05, 0.9];
    expect(randomTest(graph, () => rolls.shift() ?? 0)).toEqual(['A', 'B', 'D', 'A']);
  });

  it('returns to reset with the chance no transition takes', () => {
    expect(randomTest(graph, () => 0.7)).toEqual(['A', 'C', 'A', 'C']);
  });

  it('explores layer by layer and finds the shortest trace', () => {
    const { layers, parent } = explore(graph);
    expect(layers).toEqual([['A'], ['B', 'C'], ['D']]);
    const trace = shortestTrace(parent, 'D');
    expect(trace).toEqual(['A', 'B', 'D']);
    expect(pathEdges(trace)).toEqual(['A>B', 'B>D']);
  });

  it('lists the states that hide bugs', () => {
    expect([...bugStates(graph)]).toEqual(['D']);
  });
});
