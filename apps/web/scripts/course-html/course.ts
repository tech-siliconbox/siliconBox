import {
  type ContentImport,
  ContentImportSchema,
  type LessonBlock,
  type Level,
} from '@siliconbox/shared';
import type { Element } from 'domhandler';
import { findOne, textContent } from 'domutils';
import { parseDocument } from 'htmlparser2';
import { type Context, type Piece, convertNodes } from './blocks';
import { collapse } from './inline';
import { createNotes } from './notes';
import type { readSvgRules } from './svg-styles';

// A course folder (numbered module pages, index.html, extra reference pages) to the import file
// read by `pnpm content:import`. Each numbered module splits into one lesson per <h2> section.

export type CoursePage = { file: string; html: string };
export type CourseOptions = { slug: string; level: Level; order: number };
export type CourseSources = {
  pages: CoursePage[];
  svgRules: ReturnType<typeof readSvgRules>;
  stateGraphScript: string | null;
};

type ImportCourse = ContentImport['courses'][number];
type ImportModule = ImportCourse['modules'][number];
type DraftLesson = { title: string; blocks: LessonBlock[] };

const MODULE_FILE = /^\d+-.+\.html$/;
const WORDS_PER_MINUTE = 200;
const MODULE_SUMMARY_MAX = 300;
const OVERVIEW_TITLE = 'Course overview';
/** End-of-module review sections, merged into one lesson when they close a module. */
const REVIEW_TITLES = new Set(['Summary', 'Exercises', 'Quick quiz']);
const REVIEW_JOINER = ' · ';

const pad = (value: number) => String(value).padStart(2, '0');
const isClass = (name: string) => (element: Element) =>
  (element.attribs.class ?? '').split(/\s+/).includes(name);

function readPage(page: CoursePage) {
  const document = parseDocument(page.html, {
    lowerCaseAttributeNames: false,
    recognizeSelfClosing: true,
  });
  const root = findOne(isClass('card'), document.children) ?? document;
  const text = (test: (element: Element) => boolean) => {
    const found = findOne(test, root.children);
    return found ? collapse(textContent(found)).trim() : '';
  };
  return {
    root,
    title: text((element) => element.name === 'h1'),
    lead: text(isClass('lead')),
  };
}

/** Pieces to lessons: content before the first section joins the first section's lesson. */
function splitLessons(pieces: Piece[], fallbackTitle: string, split: boolean): DraftLesson[] {
  const lessons: DraftLesson[] = [];
  const intro: LessonBlock[] = [];
  for (const piece of pieces) {
    if ('section' in piece) {
      if (split) {
        lessons.push({ title: piece.section, blocks: lessons.length === 0 ? intro : [] });
        continue;
      }
      const heading: LessonBlock = { blockType: 'heading', level: '2', text: piece.section };
      (lessons.at(-1)?.blocks ?? intro).push(heading);
    } else {
      (lessons.at(-1)?.blocks ?? intro).push(piece);
    }
  }
  if (lessons.length === 0) return [{ title: fallbackTitle, blocks: intro }];
  return lessons;
}

/**
 * Merges the run of review sections that closes a module (Summary, Exercises, Quick quiz) into
 * one lesson. Each keeps its own heading inside; the lesson title joins their titles.
 */
function mergeReview(lessons: DraftLesson[]): DraftLesson[] {
  let start = lessons.length;
  while (start > 0 && REVIEW_TITLES.has(lessons[start - 1]?.title ?? '')) start -= 1;
  const review = lessons.slice(start);
  if (review.length < 2) return lessons;
  const blocks = review.flatMap(({ title, blocks: inner }): LessonBlock[] => [
    { blockType: 'heading', level: '2', text: title },
    ...inner,
  ]);
  return [
    ...lessons.slice(0, start),
    { title: review.map((lesson) => lesson.title).join(REVIEW_JOINER), blocks },
  ];
}

function readingMinutes(blocks: LessonBlock[]): number {
  const words = JSON.stringify(blocks).split(/\s+/).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

function convertPage(page: CoursePage, sources: CourseSources, notes: string[], split: boolean) {
  const { root, title, lead } = readPage(page);
  const context: Context = {
    notes: createNotes(page.file, notes),
    svgRules: sources.svgRules,
    stateGraphScript: sources.stateGraphScript,
  };
  if (!title) context.notes.add('no <h1> title found');
  const pieces = convertNodes(root.children, context);
  const lessons = split
    ? mergeReview(splitLessons(pieces, title, true))
    : splitLessons(pieces, title, false);
  if (lead.length > MODULE_SUMMARY_MAX) {
    context.notes.add(
      `lead is longer than ${MODULE_SUMMARY_MAX} characters; kept in the lesson only`,
    );
  }
  return { title, lead, lessons, notes: context.notes };
}

function toModule(
  slug: string,
  order: number,
  page: ReturnType<typeof convertPage>,
  previewLessons: number,
): ImportModule {
  return {
    slug,
    title: page.title,
    order,
    ...(page.lead && page.lead.length <= MODULE_SUMMARY_MAX ? { summary: page.lead } : {}),
    // Drills are authored separately and imported from their own file.
    drills: [],
    lessons: page.lessons.map((lesson, index) => ({
      slug: `${slug}-lesson-${pad(index + 1)}`,
      title: lesson.title,
      order: index + 1,
      preview: index < previewLessons,
      durationMinutes: readingMinutes(lesson.blocks),
      status: 'published' as const,
      blocks: lesson.blocks,
    })),
  };
}

/** The whole course as an import file, plus notes on anything not carried over exactly. */
export function convertCourse(sources: CourseSources, options: CourseOptions) {
  const notes: string[] = [];
  const byName = (a: CoursePage, b: CoursePage) => a.file.localeCompare(b.file);
  const modulePages = sources.pages.filter((page) => MODULE_FILE.test(page.file)).sort(byName);
  const indexPage = sources.pages.find((page) => page.file === 'index.html');
  const extraPages = sources.pages
    .filter((page) => !MODULE_FILE.test(page.file) && page !== indexPage)
    .sort(byName);
  if (indexPage === undefined) throw new Error('The course folder has no index.html');

  const index = convertPage(indexPage, sources, notes, false);
  index.notes.add(
    `the course home page became the lesson "${OVERVIEW_TITLE}" at the start of module 1`,
  );
  const modules = modulePages.map((page) => convertPage(page, sources, notes, true));
  const [first] = modules;
  if (first !== undefined) {
    first.lessons.unshift({
      title: OVERVIEW_TITLE,
      blocks: index.lessons.flatMap((l) => l.blocks),
    });
  }
  const references = extraPages.map((page) => convertPage(page, sources, notes, false));

  const course: ImportCourse = {
    slug: options.slug,
    title: index.title,
    level: options.level,
    order: options.order,
    status: 'published',
    ...(index.lead ? { summary: index.lead } : {}),
    modules: [...modules, ...references].map((page, position) =>
      // The free preview: the overview and the first lesson of module 1 (signed-in learners).
      toModule(
        `${options.slug}-module-${pad(position + 1)}`,
        position + 1,
        page,
        position === 0 ? 2 : 0,
      ),
    ),
  };
  return { content: ContentImportSchema.parse({ courses: [course] }), notes };
}
