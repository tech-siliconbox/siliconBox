import type { LessonBlock } from '@siliconbox/shared';
import { type Element, isTag } from 'domhandler';
import { findOne, textContent } from 'domutils';
import { collapse } from './inline';

// The simulation-vs-formal figure: its graph is read from the course script's data (never run)
// and its titles from the HTML panels, so the lesson keeps the author's graph and words.

type StateGraphBlock = Extract<LessonBlock, { blockType: 'stateGraph' }>;

/** The `[ { key: value, ... }, ... ]` literal assigned to `var <name>` in the script. */
function readObjects(script: string, name: string): Record<string, string>[] {
  const literal = new RegExp(`var ${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`).exec(script)?.[1];
  if (literal === undefined) throw new Error(`The script has no "var ${name} = [...]"`);
  return [...literal.matchAll(/\{([^{}]*)\}/g)].map(([, body = '']) =>
    Object.fromEntries(
      [...body.matchAll(/(\w+)\s*:\s*("[^"]*"|[\d.]+)/g)].map(([, key = '', value = '']) => [
        key,
        value.replace(/^"|"$/g, ''),
      ]),
    ),
  );
}

function panelText(panel: Element | null, selector: (element: Element) => boolean): string {
  const found = panel && findOne(selector, panel.children);
  if (!found) throw new Error('A state-graph panel is missing its title or description');
  return collapse(textContent(found)).trim();
}

const byId = (id: string) => (element: Element) => element.attribs.id === id;

/** Builds the block from the course script and the two HTML panels around it. */
export function readStateGraph(script: string, figure: Element): StateGraphBlock {
  const nodes = readObjects(script, 'nodes');
  const label = new Map(nodes.map((node) => [node.id, node.label ?? '']));
  const testLength = Number(/var TEST_LEN\s*=\s*(\d+)/.exec(script)?.[1]);
  const simulation = findOne(byId('fv-sim'), figure.children);
  const formal = findOne(byId('fv-formal'), figure.children);
  const isTitle = (element: Element) => isTag(element) && element.name === 'h4';
  const isText = (element: Element) => element.name === 'p';
  return {
    blockType: 'stateGraph',
    simulationTitle: panelText(simulation, isTitle),
    simulationText: panelText(simulation, isText),
    formalTitle: panelText(formal, isTitle),
    formalText: panelText(formal, isText),
    testLength,
    states: nodes.map((node) => ({
      label: node.label ?? '',
      x: Number(node.x),
      y: Number(node.y),
      ...(node.note ? { note: node.note } : {}),
      ...(node.bug ? { hidesBug: true } : {}),
    })),
    transitions: readObjects(script, 'edges').map((edge) => ({
      from: label.get(edge.a ?? '') ?? '',
      to: label.get(edge.b ?? '') ?? '',
      chance: Number(edge.w),
    })),
  };
}
