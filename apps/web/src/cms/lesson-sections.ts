import { type LessonSection, type SectionKind, slugify } from '@siliconbox/shared';
import { type ChildNode, type Element, isTag, isText } from 'domhandler';
import { textContent } from 'domutils';
import { parseHtml, renderHtml } from '../lib/html-document';

// The parts of an author's page (ADR 0024), for the course index: each `h2` starts a part,
// gets an anchor to jump to, a kind (theory, lab, practice, project) and a share of the
// lesson's time. The author gives one time per module; it is shared by how much each part
// holds, with hands-on parts weighted up because they are done, not read. Hidden answers
// do not count. The shares are rounded and always add up to the lesson's time.

// An assessment's questions live in their own document; weigh it like a short practice set
// (30 questions come to about an hour in an eight-hour module).
const WEIGHT = { word: 1, codeLine: 4, figure: 150, assessment: 400 } as const;
const KIND_FACTOR: Record<SectionKind, number> = { theory: 1, practice: 3, lab: 6, project: 12 };
const ROUNDING_MINUTES = { long: 5, short: 1 } as const;
const LONG_LESSON_MINUTES = 60;
const ANCHOR_MAX = 60;

type Part = Omit<LessonSection, 'minutes'> & { weight: number };
type Walk = { parts: Part[]; anchors: Set<string>; current: Part | null };

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
const hasClass = (element: Element, name: string) =>
  (element.attribs.class ?? '').split(/\s+/).includes(name);

function kindOf(title: string, inLab: boolean): SectionKind {
  const name = title.replace(/^[\d.]+\s+/, '');
  if (inLab || /^lab\b/i.test(name)) return 'lab';
  if (/\bproject\b/i.test(name)) return 'project';
  if (/^(exercises|quick quiz|quiz|assessment)\b/i.test(name)) return 'practice';
  return 'theory';
}

/** The heading's own id, or a new one from its text, unique within the lesson. */
function anchorFor(heading: Element, title: string, anchors: Set<string>): string {
  const base = heading.attribs.id ?? `section-${slugify(title, ANCHOR_MAX)}`;
  let anchor = base;
  for (let n = 2; anchors.has(anchor); n += 1) anchor = `${base}-${n}`;
  anchors.add(anchor);
  return anchor;
}

function startPart(heading: Element, walk: Walk, inLab: boolean): void {
  const title = textContent(heading).replace(/\s+/g, ' ').trim();
  const anchor = anchorFor(heading, title, walk.anchors);
  heading.attribs.id = anchor;
  walk.current = { anchor, title, kind: kindOf(title, inLab), hasDrill: false, weight: 0 };
  walk.parts.push(walk.current);
}

function weigh(nodes: ChildNode[], walk: Walk, inLab: boolean): void {
  for (const node of nodes) {
    if (isText(node) && walk.current) walk.current.weight += words(node.data) * WEIGHT.word;
    if (!isTag(node)) continue;
    if (node.name === 'h2') {
      startPart(node, walk, inLab);
      continue;
    }
    if (node.name === 'pre' && walk.current) {
      walk.current.weight += textContent(node).split('\n').length * WEIGHT.codeLine;
    }
    // Inside a reveal, only its label is read up front.
    const children = node.name === 'details' ? node.children.filter(isSummary) : node.children;
    weigh(children, walk, inLab || hasClass(node, 'lab'));
  }
}

const isSummary = (node: ChildNode) => isTag(node) && node.name === 'summary';

/** Each part's minutes: its weighted share of the total, rounded, adding up to the total. */
function shareMinutes(parts: Part[], total: number | null | undefined): (number | null)[] {
  const weights = parts.map((part) => part.weight * KIND_FACTOR[part.kind]);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!total || sum === 0) return parts.map(() => null);
  const unit = total >= LONG_LESSON_MINUTES ? ROUNDING_MINUTES.long : ROUNDING_MINUTES.short;
  const minutes = weights.map((w) => Math.max(unit, Math.round((total * w) / sum / unit) * unit));
  const largest = minutes.indexOf(Math.max(...minutes));
  minutes[largest] = Math.max(
    unit,
    (minutes[largest] ?? 0) + total - minutes.reduce((a, b) => a + b),
  );
  return minutes;
}

type Block = { blockType?: unknown; html?: unknown };

/**
 * The lesson's parts, and its blocks with an anchor on every part heading. Only `html`
 * blocks (author pages) have parts; a Drill embed marks the part it follows.
 */
export function deriveSections<B extends Block>(
  blocks: readonly B[],
  totalMinutes: number | null | undefined,
): { blocks: B[]; sections: LessonSection[] } {
  const walk: Walk = { parts: [], anchors: new Set(), current: null };
  const anchored = blocks.map((block) => {
    if (block.blockType === 'drillEmbed' && walk.current) walk.current.hasDrill = true;
    if (block.blockType === 'stateGraph' && walk.current) walk.current.weight += WEIGHT.figure;
    if (block.blockType === 'assessmentEmbed' && walk.current) {
      walk.current.weight += WEIGHT.assessment;
    }
    if (block.blockType !== 'html' || typeof block.html !== 'string') return block;
    const document = parseHtml(block.html);
    weigh(document.children, walk, false);
    return { ...block, html: renderHtml(document) };
  });
  const minutes = shareMinutes(walk.parts, totalMinutes);
  const sections = walk.parts.map(({ anchor, title, kind, hasDrill }, i) => ({
    anchor,
    title,
    kind,
    hasDrill,
    minutes: minutes[i] ?? null,
  }));
  return { blocks: anchored, sections };
}
