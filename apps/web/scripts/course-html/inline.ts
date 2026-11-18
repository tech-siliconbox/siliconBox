import { escapeInlineText, inlineCode } from '@siliconbox/shared';
import { type ChildNode, type Element, isTag, isText } from 'domhandler';
import { textContent } from 'domutils';
import type { Notes } from './notes';

// HTML inline markup to the lesson text format (packages/shared/src/inline-text.ts).

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  n: 'ⁿ',
  i: 'ⁱ',
  '+': '⁺',
  '-': '⁻',
};

/** Collapses HTML whitespace the way a browser shows it. */
export const collapse = (text: string): string => text.replace(/\s+/g, ' ');

/** Wraps `inner` in a marker, keeping edge spaces outside so the marker stays valid. */
function wrap(marker: string, inner: string): string {
  const content = inner.trim();
  if (content === '') return inner;
  const lead = inner.startsWith(' ') ? ' ' : '';
  const trail = inner.endsWith(' ') ? ' ' : '';
  return `${lead}${marker}${content}${marker}${trail}`;
}

function superscript(element: Element, notes: Notes): string {
  const text = textContent(element);
  if (/^[0-9ni+-]+$/.test(text)) return text.replace(/./g, (char) => SUPERSCRIPT[char] ?? char);
  notes.add(`superscript "${text}" has no Unicode form; written as ^(${text})`);
  return escapeInlineText(`^(${text})`);
}

/** Labelled spans in the course home's module list: number, hours pill, description. */
function span(element: Element, inner: string, lineBreak: string): string {
  const classes = (element.attribs.class ?? '').split(/\s+/);
  // The numbered list already shows the module number.
  if (classes.includes('num')) return '';
  if (classes.includes('pill')) return ` · ${inner.trim()}`;
  if (classes.includes('desc')) return `${lineBreak}${inner.trim()}`;
  return inner;
}

type Convert = (element: Element, notes: Notes, lineBreak: string) => string;

const inner: Convert = (element, notes, lineBreak) =>
  inlineText(element.children, notes, lineBreak);
const strong: Convert = (element, notes, lineBreak) => wrap('**', inner(element, notes, lineBreak));
const em: Convert = (element, notes, lineBreak) => wrap('*', inner(element, notes, lineBreak));

const ELEMENTS: Record<string, Convert> = {
  code: (element) => inlineCode(textContent(element)),
  strong,
  b: strong,
  em,
  i: em,
  sup: (element, notes) => superscript(element, notes),
  br: (_element, notes, lineBreak) => {
    if (lineBreak === ' ') notes.add('a line break inside a paragraph became a space');
    return lineBreak;
  },
  a: (element, notes, lineBreak) => {
    notes.add('links between course pages kept as plain text (the site outline links them)');
    return inner(element, notes, lineBreak);
  },
  span: (element, notes, lineBreak) => span(element, inner(element, notes, lineBreak), lineBreak),
};

function inlineElement(element: Element, notes: Notes, lineBreak: string): string {
  const convert = ELEMENTS[element.name];
  if (convert) return convert(element, notes, lineBreak);
  notes.add(`<${element.name}> inside text kept as plain text`);
  return inner(element, notes, lineBreak);
}

/**
 * Inline nodes to lesson text. `lineBreak` is what <br> becomes: a paragraph break in
 * multi-line fields, a space in single paragraphs.
 */
export function inlineText(nodes: ChildNode[], notes: Notes, lineBreak = ' '): string {
  return nodes
    .map((node) => {
      if (isText(node)) return escapeInlineText(collapse(node.data));
      if (isTag(node)) return inlineElement(node, notes, lineBreak);
      return '';
    })
    .join('');
}

/** Inline text with paragraph breaks tidied: no stray spaces around line breaks. */
export function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
