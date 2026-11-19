import {
  type ImportAssessment,
  type ImportCapstone,
  OPTION_LETTERS,
  type OptionLetter,
} from '@siliconbox/shared';
import { type ChildNode, type Document, Element, isTag } from 'domhandler';
import { append, findAll, findOne, removeElement, replaceElement, textContent } from 'domutils';
import type { Notes } from './notes';
import { renderHtml } from '../../src/lib/html-document';

// A module page's assessment and capstone rubric to graded course work (ADR 0029). The questions
// and answer key leave the page for an assessment (its key kept apart, on the server); the
// rubric table becomes the capstone's rubric. Each is replaced by a placeholder that
// `pageBlocks` turns into its block, so a re-import never brings the key back into the page.

/** Where course work stood in the page; `pageBlocks` turns it into an embed block. */
export const EMBED_TAG = 'siliconbox-embed';

type Root = Element | Document;
type Assessment = Omit<ImportAssessment, 'status'>;
type Capstone = Omit<ImportCapstone, 'status'>;

const text = (node: ChildNode) => textContent(node).replace(/\s+/g, ' ').trim();
const markup = (nodes: ChildNode[]) => renderHtml(nodes).trim();
const isTagNamed = (node: ChildNode | null, name: string): node is Element =>
  node !== null && isTag(node) && node.name === name;
/** "10.4 Assessment: 30 questions" without its section number. */
const titleOf = (heading: Element) => text(heading).replace(/^[\d.]+\s+/, '');

function placeholder(blockType: 'assessmentEmbed' | 'capstoneEmbed', slug: string): Element {
  return new Element(EMBED_TAG, { 'data-block': blockType, 'data-slug': slug });
}

/** A top-level h2 and everything after it up to the next h2. */
function section(root: Root, heading: RegExp): { heading: Element; nodes: ChildNode[] } | null {
  const found = root.children.find(
    (node): node is Element => isTagNamed(node, 'h2') && heading.test(text(node)),
  );
  if (found === undefined) return null;
  const nodes: ChildNode[] = [];
  for (let node = found.next; node !== null && !isTagNamed(node, 'h2'); node = node.next) {
    nodes.push(node);
  }
  return { heading: found, nodes };
}

/** One `<li>`: its own text is the question; its nested list holds the lettered options. */
function readQuestion(item: Element, topic: string) {
  const list = item.children.find((node) => isTagNamed(node, 'ul'));
  if (list === undefined) throw new Error(`An assessment question has no options: ${text(item)}`);
  const options = list.children
    .filter((node) => isTagNamed(node, 'li'))
    .map((option) => ({ html: markup(option.children).replace(/^[A-F]\)\s*/, '') }));
  return { topic, html: markup(item.children.filter((node) => node !== list)), options };
}

function readQuestions(nodes: ChildNode[]): Assessment['questions'] {
  let topic = '';
  return nodes.flatMap((node) => {
    if (isTagNamed(node, 'h3')) topic = text(node);
    if (!isTagNamed(node, 'ol')) return [];
    return node.children
      .filter((item) => isTagNamed(item, 'li'))
      .map((item) => readQuestion(item, topic));
  });
}

const isLetter = (value: string): value is OptionLetter =>
  (OPTION_LETTERS as readonly string[]).includes(value);

/** The answer-key table: question number, letter, and why. */
function readKey(nodes: ChildNode[]): Assessment['key'] {
  const start = nodes.findIndex((node) => isTagNamed(node, 'h3') && /answer key/i.test(text(node)));
  const table = start < 0 ? null : findOne((e) => e.name === 'table', nodes.slice(start + 1));
  if (table === null) throw new Error('The assessment has no answer-key table');
  const rows = findAll((e) => e.name === 'tr', table.children).filter(
    (row) => findOne((e) => e.name === 'td', row.children) !== null,
  );
  return rows.map((row) => {
    const [, letterCell, whyCell] = row.children.filter((cell) => isTagNamed(cell, 'td'));
    const letter = letterCell === undefined ? '' : text(letterCell);
    if (!isLetter(letter)) throw new Error(`The answer key has "${letter}" for an answer`);
    const why = whyCell === undefined ? '' : markup(whyCell.children);
    return why === '' ? { correct: letter } : { correct: letter, why };
  });
}

/** The section's assessment, taken out of the page; null when the page has none. */
export function extractAssessment(root: Root, slug: string, notes: Notes): Assessment | null {
  const found = section(root, /\bassessment\b/i);
  if (found === null) return null;
  const pass = /passing score:?\s*(\d+)\s+of\s+(\d+)/i.exec(found.nodes.map(text).join(' '));
  if (pass === null) throw new Error('The assessment does not say its passing score');
  const questions = readQuestions(found.nodes);
  const key = readKey(found.nodes);
  if (key.length !== questions.length) {
    throw new Error(`The assessment has ${questions.length} questions but ${key.length} answers`);
  }
  for (const node of found.nodes) removeElement(node);
  append(found.heading, placeholder('assessmentEmbed', slug));
  notes.add(
    `the ${questions.length} assessment questions and the answer key became a graded assessment; its instructions and the key are no longer printed in the page`,
  );
  return { slug, title: titleOf(found.heading), passMark: Number(pass[1]), questions, key };
}

const headerCells = (table: Element) =>
  findAll((e) => e.name === 'th', table.children).map((cell) => text(cell).toLowerCase());

/** The rubric table (Criterion, Points, What earns full marks), taken out of the page. */
export function extractCapstone(root: Root, slug: string, notes: Notes): Capstone | null {
  const table = root.children.find(
    (node): node is Element =>
      isTagNamed(node, 'table') && headerCells(node).slice(0, 2).join(',') === 'criterion,points',
  );
  if (table === undefined) return null;
  const pass = /score of\s+(\d+)\s+or more/i.exec(textContent(root.children));
  if (pass === null) throw new Error('The capstone rubric does not say its passing score');
  const rubric = findAll((e) => e.name === 'tr', table.children).flatMap((row) => {
    const [criterion, points, fullMarks] = row.children.filter((cell) => isTagNamed(cell, 'td'));
    if (criterion === undefined || points === undefined) return [];
    const html = fullMarks === undefined ? '' : markup(fullMarks.children);
    return [
      {
        criterion: text(criterion),
        points: Number(text(points)),
        ...(html && { fullMarks: html }),
      },
    ];
  });
  const heading = section(root, /\bcapstone\b/i)?.heading;
  replaceElement(table, placeholder('capstoneEmbed', slug));
  notes.add('the grading rubric is shown by the capstone block, with the upload and the grade');
  return {
    slug,
    title: heading === undefined ? 'Capstone project' : titleOf(heading),
    passMark: Number(pass[1]),
    rubric,
  };
}
