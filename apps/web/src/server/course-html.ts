import 'server-only';
import { ROUTES } from '@siliconbox/shared';
import { type ChildNode, type Element, isTag, isText } from 'domhandler';
import { findAll } from 'domutils';
import sanitizeHtml from 'sanitize-html';
import { parseHtml, renderHtml } from '@/lib/html-document';
import { embedMark } from './invisible-mark';
import { SVG_ATTRIBUTES, SVG_ELEMENTS } from './sanitize-svg';

// An author's course page markup (ADR 0024): links resolved on the server, the learner's
// invisible mark added to each passage, and an allow-list sanitiser run on every render.

const PAGE_ELEMENTS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'span',
  'div',
  'section',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'pre',
  'code',
  'strong',
  'em',
  'b',
  'i',
  'sup',
  'sub',
  'br',
  'a',
  'details',
  'summary',
  'figure',
  'figcaption',
  'blockquote',
  'hr',
];
const PAGE_ATTRIBUTES = ['class', 'id', 'href', 'role', 'aria-label', 'open', 'colspan', 'rowspan'];

/** Allow-listed markup: no scripts, handlers, inline styles, forms, frames or external media. */
export function sanitizeCourseHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...PAGE_ELEMENTS, ...SVG_ELEMENTS],
    allowedAttributes: { '*': [...PAGE_ATTRIBUTES, ...SVG_ATTRIBUTES] },
    allowedSchemes: ['https'],
    allowedSchemesAppliedToAttributes: ['href'],
    allowProtocolRelative: false,
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  });
}

const LINK = /href="(lesson|course):([a-z0-9-]+)"/g;

/** Slugs of the lessons a page links to (`lesson:<slug>`). */
export const linkedLessonSlugs = (html: string): string[] =>
  [...html.matchAll(LINK)].filter(([, kind]) => kind === 'lesson').map(([, , slug = '']) => slug);

/**
 * `lesson:` and `course:` links to site paths, given each published lesson's course by its
 * slug; a lesson that is not published links nowhere.
 */
export function resolveCourseLinks(
  html: string,
  lessonCourses: ReadonlyMap<string, string>,
): string {
  return html.replace(LINK, (_match, kind: string, slug: string) => {
    if (kind === 'course') return `href="${ROUTES.course(slug)}"`;
    const course = lessonCourses.get(slug);
    return course === undefined ? 'href="#"' : `href="${ROUTES.lesson(course, slug)}"`;
  });
}

const MARKED = new Set(['p', 'li', 'td', 'th', 'figcaption', 'summary']);
const UNMARKED_INSIDE = new Set(['pre', 'code', 'svg']);

/** The first text with words in it, outside code. */
function firstText(nodes: ChildNode[]): { data: string } | null {
  for (const node of nodes) {
    if (isText(node) && node.data.trim() !== '') return node;
    if (isTag(node) && !UNMARKED_INSIDE.has(node.name)) {
      const found = firstText(node.children);
      if (found !== null) return found;
    }
  }
  return null;
}

const insideCode = (element: Element): boolean =>
  element.parent !== null &&
  isTag(element.parent) &&
  (UNMARKED_INSIDE.has(element.parent.name) || insideCode(element.parent));

function markFirstWord(node: { data: string } | null, code: number): void {
  if (node === null) return;
  const start = node.data.search(/\S/);
  node.data = node.data.slice(0, start) + embedMark(node.data.slice(start), code);
}

/** A short piece of markup (an assessment question or option): the mark after its first word. */
export function markHtmlFragment(html: string, code: number): string {
  const document = parseHtml(html);
  markFirstWord(firstText(document.children), code);
  return renderHtml(document);
}

/** The learner's invisible mark after the first word of every passage; code stays untouched. */
export function markCourseHtml(html: string, code: number): string {
  const document = parseHtml(html);
  for (const element of findAll(
    (node) => MARKED.has(node.name) && !insideCode(node),
    document.children,
  )) {
    markFirstWord(firstText(element.children), code);
  }
  return renderHtml(document);
}
