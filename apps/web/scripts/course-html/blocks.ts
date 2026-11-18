import type { LessonBlock, RevealContentBlock } from '@siliconbox/shared';
import { type ChildNode, type Element, isTag, isText } from 'domhandler';
import { findAll, findOne, textContent } from 'domutils';
import { collapse, inlineText, tidy } from './inline';
import type { Notes } from './notes';
import { readStateGraph } from './state-graph';
import { inlineSvg, type readSvgRules } from './svg-styles';

// Course HTML elements to lesson blocks. Text is copied as written; anything that cannot be kept
// exactly is written to the notes.

export type Piece = LessonBlock | { section: string };

export type Context = {
  notes: Notes;
  svgRules: ReturnType<typeof readSvgRules>;
  /** The course's state-graph script, for the simulation-vs-formal figure. */
  stateGraphScript: string | null;
};

/** Site chrome around the lesson text; the site supplies its own. */
const CHROME = new Set(['header', 'nav', 'script', 'link', 'meta', 'title', 'style']);
const CHROME_CLASSES = ['nav-bar', 'module-tag', 'fv-legend'];
const CONTAINERS = new Set(['main', 'article', 'section', 'div', 'body', 'html']);
const ANSWER_LABEL = 'Show answer';

const classesOf = (element: Element) => (element.attribs.class ?? '').split(/\s+/);
const hasClass = (element: Element, name: string) => classesOf(element).includes(name);
const elements = (nodes: ChildNode[]) => nodes.filter(isTag);
const plain = (element: Element) => collapse(textContent(element)).trim();

function bullets(list: Element, notes: Notes): string {
  if (list.name === 'ol') notes.add('a numbered list inside text became bullets');
  return elements(list.children)
    .filter((item) => item.name === 'li')
    .map((item) => `- ${tidy(inlineText(item.children, notes))}`)
    .join('\n');
}

/** Block-level text inside a text field (a list or a paragraph), or null for inline nodes. */
function blockText(node: ChildNode, notes: Notes): string | null {
  if (!isTag(node)) return null;
  if (node.name === 'ul' || node.name === 'ol') return bullets(node, notes);
  if (node.name === 'p' || node.name === 'div') return richText(node.children, notes);
  return null;
}

/** Inline and nested-list content as multi-line text: paragraphs and "- " bullets. */
function richText(nodes: ChildNode[], notes: Notes): string {
  const parts: string[] = [];
  let line = '';
  for (const node of nodes) {
    const block = blockText(node, notes);
    if (block === null) {
      line += inlineText([node], notes, '\n\n');
    } else {
      parts.push(line, block);
      line = '';
    }
  }
  parts.push(line);
  return tidy(
    parts
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n\n'),
  );
}

type ListItem = Extract<RevealContentBlock, { blockType: 'list' }>['items'][number];

function listItem(children: ChildNode[], notes: Notes): ListItem {
  const details = elements(children).find((child) => child.name === 'details');
  const text = richText(
    children.filter((child) => child !== details),
    notes,
  );
  if (details === undefined) return { text };
  const summary = elements(details.children).find((child) => child.name === 'summary');
  if (summary && plain(summary) !== ANSWER_LABEL) {
    notes.add(`answer button "${plain(summary)}" shows as "${ANSWER_LABEL}"`);
  }
  const answer = richText(
    details.children.filter((child) => child !== summary),
    notes,
  );
  return { text, answer };
}

/**
 * A list, split around any table inside an item: the table follows that item and a numbered
 * list carries on from the next number, so the page reads as the original.
 */
function list(element: Element, notes: Notes): RevealContentBlock[] {
  const ordered = element.name === 'ol';
  const blocks: RevealContentBlock[] = [];
  let items: ListItem[] = [];
  let start = 1;
  const flush = () => {
    if (items.length === 0) return;
    blocks.push({ blockType: 'list', ordered, ...(start > 1 ? { start } : {}), items });
    start += items.length;
    items = [];
  };
  for (const item of elements(element.children).filter((child) => child.name === 'li')) {
    const tables = elements(item.children).filter((child) => child.name === 'table');
    const isTable = (child: ChildNode) => isTag(child) && child.name === 'table';
    items.push(
      listItem(
        item.children.filter((child) => !isTable(child)),
        notes,
      ),
    );
    if (tables.length > 0) {
      flush();
      blocks.push(...tables.map((inner) => table(inner, notes)));
      notes.add('a table inside a list item now follows that item, and the list continues');
    }
  }
  flush();
  return blocks;
}

function table(element: Element, notes: Notes): RevealContentBlock {
  const rows = findAll((node) => node.name === 'tr', element.children);
  const [head, ...body] = rows;
  const cells = (row: Element | undefined) =>
    elements(row?.children ?? [])
      .filter((cell) => cell.name === 'td' || cell.name === 'th')
      .map((cell) => ({ text: richText(cell.children, notes) }));
  if (head === undefined || !elements(head.children).some((cell) => cell.name === 'th')) {
    notes.add('a table without a header row: its first row became the header');
  }
  return {
    blockType: 'table',
    columns: cells(head),
    rows: body.map((row) => ({ cells: cells(row) })),
  };
}

function language(code: string, filename: string | null) {
  if (filename?.endsWith('.sby') || /^\[(tasks|options|engines|script|files)\]/m.test(code)) {
    return 'sby' as const;
  }
  if (filename?.endsWith('.sv') || filename?.endsWith('.v')) return 'systemverilog' as const;
  return /\b(module|assert|assume|cover|property|always|logic|endmodule)\b/.test(code)
    ? ('systemverilog' as const)
    : ('text' as const);
}

function code(pre: Element, filename: string | null, forceText = false): RevealContentBlock {
  // Keep indentation; drop only the blank edges a <pre> carries.
  const source = textContent(pre).replace(/^\n/, '').replace(/\s+$/, '');
  return {
    blockType: 'code',
    language: forceText ? 'text' : language(source, filename),
    code: source,
    ...(filename ? { filename } : {}),
  };
}

const TONES: Record<string, 'tip' | 'warning' | 'danger'> = {
  tip: 'tip',
  warn: 'warning',
  danger: 'danger',
};

function callout(element: Element, notes: Notes): RevealContentBlock {
  const tone = classesOf(element)
    .map((name) => TONES[name])
    .find((value) => value !== undefined);
  const title = elements(element.children).find((child) => hasClass(child, 'title'));
  return {
    blockType: 'callout',
    tone: tone ?? 'note',
    ...(title ? { title: plain(title) } : {}),
    text: richText(
      element.children.filter((child) => child !== title),
      notes,
    ),
  };
}

function diagram(figure: Element, context: Context): RevealContentBlock | null {
  const svg = findOne((node) => node.name === 'svg', figure.children);
  if (svg === null) {
    context.notes.add('a figure without an SVG was left out');
    return null;
  }
  const caption = findOne((node) => node.name === 'figcaption', figure.children);
  const alt = svg.attribs['aria-label'] ?? (caption ? plain(caption) : '');
  if (!alt) context.notes.add('a diagram has no description; screen readers will get none');
  return {
    blockType: 'diagram',
    svg: inlineSvg(svg, context.svgRules, context.notes),
    alt: alt.slice(0, 300),
    ...(caption ? { caption: richText(caption.children, context.notes) } : {}),
  };
}

function reveal(details: Element, context: Context): LessonBlock {
  const summary = elements(details.children).find((child) => child.name === 'summary');
  const content = convertNodes(
    details.children.filter((child) => child !== summary),
    context,
  ).filter((piece): piece is RevealContentBlock => {
    if ('section' in piece || piece.blockType === 'reveal' || piece.blockType === 'stateGraph') {
      context.notes.add(
        'a heading section or interactive block inside "show" content was left out',
      );
      return false;
    }
    return true;
  });
  return { blockType: 'reveal', label: summary ? plain(summary) : 'Show', content };
}

/** Converts a run of sibling nodes, carrying a code filename over to the <pre> after it. */
export function convertNodes(nodes: ChildNode[], context: Context): Piece[] {
  const pieces: Piece[] = [];
  let filename: string | null = null;
  for (const node of nodes) {
    if (isText(node)) {
      const text = tidy(inlineText([node], context.notes));
      if (text) pieces.push({ blockType: 'paragraph', text });
      continue;
    }
    if (!isTag(node)) continue;
    if (hasClass(node, 'filename')) {
      filename = plain(node);
      continue;
    }
    pieces.push(...convertElement(node, context, filename));
    filename = null;
  }
  return pieces;
}

type Handler = (element: Element, context: Context, filename: string | null) => Piece[];

const heading =
  (level: '3' | '4'): Handler =>
  (element) => [{ blockType: 'heading', level, text: plain(element) }];
const asList: Handler = (element, { notes }) => list(element, notes);

const BY_TAG: Record<string, Handler> = {
  h1: () => [],
  h2: (element) => [{ section: plain(element) }],
  h3: heading('3'),
  h4: heading('4'),
  p: (element, { notes }) => {
    const text = tidy(inlineText(element.children, notes));
    return text ? [{ blockType: 'paragraph', text }] : [];
  },
  ul: asList,
  ol: asList,
  table: (element, { notes }) => [table(element, notes)],
  pre: (element, _context, filename) => [code(element, filename)],
  details: (element, context) => [reveal(element, context)],
  figure: (element, context) => {
    const block = diagram(element, context);
    return block ? [block] : [];
  },
};

const BY_CLASS: [string, Handler][] = [
  ['callout', (element, { notes }) => [callout(element, notes)]],
  [
    'wave',
    (element) => {
      const pre = findOne((node) => node.name === 'pre', element.children);
      return pre ? [code(pre, null, true)] : [];
    },
  ],
  [
    'fv-compare',
    (element, { stateGraphScript }) => {
      if (stateGraphScript === null) throw new Error('The state-graph script was not found');
      return [readStateGraph(stateGraphScript, element)];
    },
  ],
];

const isChrome = (element: Element) =>
  CHROME.has(element.name) || CHROME_CLASSES.some((name) => hasClass(element, name));

function convertElement(element: Element, context: Context, filename: string | null): Piece[] {
  if (isChrome(element)) return [];
  const handler = BY_TAG[element.name] ?? BY_CLASS.find(([name]) => hasClass(element, name))?.[1];
  if (handler) return handler(element, context, filename);
  if (!CONTAINERS.has(element.name)) {
    context.notes.add(
      `<${element.name}> is not a known lesson element; its content was kept as text`,
    );
  }
  return convertNodes(element.children, context);
}
