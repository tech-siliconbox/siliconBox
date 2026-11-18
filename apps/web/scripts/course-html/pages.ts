import type { LessonBlock } from '@siliconbox/shared';
import { type ChildNode, type Document, type Element, isTag } from 'domhandler';
import { findAll, findOne, removeElement, textContent } from 'domutils';
import { EMBED_TAG } from './course-work';
import type { Notes } from './notes';
import { readStateGraph } from './state-graph';
import { type SvgRules, styleSvg } from './svg-styles';
import { parseHtml, renderHtml } from '../../src/lib/html-document';

// One course page (HTML file) to lesson blocks, keeping every part of the author's content
// (ADR 0024); the site supplies the design. What changes: the interactive figure becomes a
// state-graph block, a Drill follows each lab, links point at lessons, diagrams carry their own
// colours, and inline styles (which the site's CSP refuses) are dropped.

export type PageContext = {
  /** Course file name to its link token, `lesson:<slug>` or `course:<slug>`. */
  links: Map<string, string>;
  /** Diagram rules from the course stylesheet, written onto each SVG (graphics keep colours). */
  svgRules: SvgRules;
  stateGraphScript: string | null;
  /** Drills to show after this page's lab. */
  drills: string[];
  notes: Notes;
};

export type CoursePageParts = {
  title: string;
  heading: string;
  lead: string;
  minutes: number | null;
  root: Element | Document;
};

const hasClass = (element: Element, name: string) =>
  (element.attribs.class ?? '').split(/\s+/).includes(name);
const text = (element: Element | null) =>
  element === null ? '' : textContent(element).replace(/\s+/g, ' ').trim();

/** Reads a page: its <title> (up to " | "), <h1>, lead, estimated time and article. */
export function readCoursePage(html: string): CoursePageParts {
  const document = parseHtml(html);
  const find = (test: (element: Element) => boolean) => findOne(test, document.children);
  const root = find((element) => element.name === 'article') ?? document;
  const hours = /Estimated time:\s*([\d.]+)/.exec(text(find((e) => hasClass(e, 'meta'))))?.[1];
  return {
    title: (text(find((element) => element.name === 'title')).split(' | ')[0] ?? '').trim(),
    heading: text(find((element) => element.name === 'h1')),
    lead: text(find((element) => hasClass(element, 'lead'))),
    minutes: hours === undefined ? null : Math.min(600, Math.round(Number(hours) * 60)),
    root,
  };
}

/** Removes scripts, points links at lessons and gives diagrams their own colours. */
function prepare(root: Element | Document, context: PageContext): void {
  const all = findAll(() => true, root.children);
  for (const script of all.filter((element) => element.name === 'script')) {
    removeElement(script);
    context.notes.add('a script was removed (the interactive figure is rebuilt as a block)');
  }
  for (const svg of all.filter((element) => element.name === 'svg')) {
    styleSvg(svg, context.svgRules, context.notes);
  }
  for (const element of all) {
    const href = element.attribs.href;
    const token = href === undefined ? undefined : context.links.get(href);
    if (token !== undefined) element.attribs.href = token;
    if (element.attribs.style !== undefined) {
      context.notes.add(
        `an inline style on <${element.name}> was dropped (the site's design applies)`,
      );
      delete element.attribs.style;
    }
  }
}

const serialize = (nodes: ChildNode[]) => renderHtml(nodes).trim();

/** The block for course work taken out of the page (`extractAssessment`, `extractCapstone`). */
function embedBlock(node: Element): LessonBlock {
  const slug = node.attribs['data-slug'] ?? '';
  return node.attribs['data-block'] === 'assessmentEmbed'
    ? { blockType: 'assessmentEmbed', assessment: slug }
    : { blockType: 'capstoneEmbed', capstone: slug };
}

/** Blocks standing in place of a node (graded work, the interactive figure), or null to keep it. */
function standIn(node: ChildNode, context: PageContext): LessonBlock[] | null {
  if (!isTag(node)) return null;
  if (node.name === EMBED_TAG) return [embedBlock(node)];
  if (hasClass(node, 'fv-compare')) {
    if (context.stateGraphScript === null) throw new Error('The state-graph script was not found');
    return [readStateGraph(context.stateGraphScript, node)];
  }
  if (hasClass(node, 'fv-legend')) {
    context.notes.add('the figure legend is drawn by the state-graph block');
    return [];
  }
  return null;
}

/** The page's content as blocks: markup runs, the state graph, Drills after the lab, graded work. */
export function pageBlocks(root: Element | Document, context: PageContext): LessonBlock[] {
  prepare(root, context);
  const blocks: LessonBlock[] = [];
  let run: ChildNode[] = [];
  const flush = () => {
    const html = serialize(run);
    if (html !== '') blocks.push({ blockType: 'html', html });
    run = [];
  };
  for (const node of root.children) {
    const inPlace = standIn(node, context);
    if (inPlace !== null) {
      if (inPlace.length > 0) flush();
      blocks.push(...inPlace);
      continue;
    }
    run.push(node);
    if (isTag(node) && hasClass(node, 'lab')) {
      flush();
      blocks.push(...context.drills.map((drill) => ({ blockType: 'drillEmbed' as const, drill })));
    }
  }
  flush();
  return blocks;
}

/** The page's markup as one string (the course home), prepared the same way. */
export function pageMarkup(root: Element | Document, context: PageContext): string {
  prepare(root, context);
  return serialize(root.children);
}
