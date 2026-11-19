import { type ContentImport, ContentImportSchema, type Level, slugify } from '@siliconbox/shared';
import { extractAssessment, extractCapstone } from './course-work';
import { createNotes } from './notes';
import { type CoursePageParts, pageBlocks, pageMarkup, readCoursePage } from './pages';
import { readSvgRules } from './svg-styles';

// A course folder (index.html, numbered module pages, reference pages, a stylesheet) to the
// import file read by `pnpm content:import`. Every page stays one page with all its content,
// shown in the site's design (ADR 0024): the course home becomes the course page, each module
// page one lesson, each reference page a module of its own. The course stylesheet is read only
// for the colours of its diagrams.

export type CoursePage = { file: string; html: string };
export type CourseOptions = {
  slug: string;
  level: Level;
  order: number;
  /** Drill slugs per module slug, shown after that module's lab. */
  drillsByModule: ReadonlyMap<string, string[]>;
};
export type CourseSources = {
  pages: CoursePage[];
  stylesheet: string;
  stateGraphScript: string | null;
};

type ImportCourse = ContentImport['courses'][number];
type ImportModule = ImportCourse['modules'][number];

const MODULE_FILE = /^\d+-.+\.html$/;
/** Diagrams are styled by rules under this class in the course stylesheet. */
const DIAGRAM_SCOPE = 'fv-flow';
const INDEX_FILE = 'index.html';
const MODULE_SUMMARY_MAX = 300;
/** The first module is the free preview for signed-in learners (access model). */
const FREE_MODULES = 1;

const pad = (value: number) => String(value).padStart(2, '0');
const moduleSlug = (course: string, position: number) => `${course}-module-${pad(position)}`;

/** Course pages in reading order: numbered modules first, then reference pages. */
function orderPages(pages: CoursePage[]): CoursePage[] {
  const byName = (a: CoursePage, b: CoursePage) => a.file.localeCompare(b.file);
  const others = pages.filter((page) => page.file !== INDEX_FILE);
  return [
    ...others.filter((page) => MODULE_FILE.test(page.file)).sort(byName),
    ...others.filter((page) => !MODULE_FILE.test(page.file)).sort(byName),
  ];
}

/** Each page's lesson slug, from its heading: the readable part of its address (ADR 0026). */
function withLessonSlugs<P extends { parts: CoursePageParts }>(
  pages: P[],
): (P & { slug: string })[] {
  const used = new Set<string>();
  return pages.map((page) => {
    const base = slugify(page.parts.heading);
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    return { ...page, slug };
  });
}

function toModule(
  slug: string,
  position: number,
  lesson: { slug: string; parts: CoursePageParts },
  blocks: ImportModule['lessons'][number]['blocks'],
): ImportModule {
  const { parts } = lesson;
  const summary = parts.lead.length <= MODULE_SUMMARY_MAX ? parts.lead : '';
  return {
    slug: moduleSlug(slug, position),
    title: parts.heading,
    order: position,
    ...(summary ? { summary } : {}),
    drills: [],
    lessons: [
      {
        slug: lesson.slug,
        title: parts.title || parts.heading,
        order: 1,
        preview: position <= FREE_MODULES,
        ...(parts.minutes === null ? {} : { durationMinutes: parts.minutes }),
        status: 'published',
        blocks,
      },
    ],
  };
}

type CourseWork = {
  assessment: Omit<NonNullable<ImportModule['assessment']>, 'status'> | null;
  capstone: Omit<NonNullable<ImportModule['capstone']>, 'status'> | null;
};

/** A module's graded work, published with its page. */
function withCourseWork({ assessment, capstone }: CourseWork) {
  return {
    ...(assessment && { assessment: { ...assessment, status: 'published' as const } }),
    ...(capstone && { capstone: { ...capstone, status: 'published' as const } }),
  };
}

/** The whole course as an import file, plus notes on anything not kept exactly. */
export function convertCourse(sources: CourseSources, options: CourseOptions) {
  const notes: string[] = [];
  const index = sources.pages.find((page) => page.file === INDEX_FILE);
  if (index === undefined) throw new Error('The course folder has no index.html');
  const pages = withLessonSlugs(
    orderPages(sources.pages).map((page) => ({ ...page, parts: readCoursePage(page.html) })),
  );
  const links = new Map<string, string>([
    [INDEX_FILE, `course:${options.slug}`],
    ...pages.map((page): [string, string] => [page.file, `lesson:${page.slug}`]),
  ]);
  const svgRules = readSvgRules(sources.stylesheet, DIAGRAM_SCOPE);
  const context = (file: string, drills: string[]) => ({
    links,
    svgRules,
    stateGraphScript: sources.stateGraphScript,
    drills,
    notes: createNotes(file, notes),
  });

  const home = readCoursePage(index.html);
  const introduction = pageMarkup(home.root, context(INDEX_FILE, []));
  const modules = pages.map((page, i) => {
    const slug = moduleSlug(options.slug, i + 1);
    const pageContext = context(page.file, options.drillsByModule.get(slug) ?? []);
    const work = {
      assessment: extractAssessment(page.parts.root, `${slug}-assessment`, pageContext.notes),
      capstone: extractCapstone(page.parts.root, `${slug}-capstone`, pageContext.notes),
    };
    const blocks = pageBlocks(page.parts.root, pageContext);
    return { ...toModule(options.slug, i + 1, page, blocks), ...withCourseWork(work) };
  });

  const course: ImportCourse = {
    slug: options.slug,
    title: home.heading,
    level: options.level,
    order: options.order,
    status: 'published',
    ...(home.lead ? { summary: home.lead } : {}),
    introduction,
    modules,
  };
  return { content: ContentImportSchema.parse({ courses: [course] }), notes };
}
