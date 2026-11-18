// `pnpm content:convert <course folder> <level> <out.json> [drills.json] [course slug]`:
// turns a folder of course HTML pages into the JSON file `pnpm content:import` loads. Each page
// keeps its own markup and the course keeps its own stylesheet (ADR 0024); every change is
// printed at the end. The course folder holds the pages, with the stylesheet and scripts in
// ../assets. With a drills file, each module's Drills (from an import file) follow its lab.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ContentImportSchema, LEVELS, LevelSchema } from '@siliconbox/shared';
import { convertCourse } from './course-html/course';

const STYLESHEET = 'style.css';
const STATE_GRAPH_SCRIPT = 'sim-vs-formal.js';

// Positional only: `payload run` drops `--option` arguments before the script sees them.
const [folderArg, levelArg, outArg, drillsArg, slugArg] = process.argv.slice(2);
if (!folderArg || !levelArg || !outArg) {
  throw new Error(
    'Usage: pnpm content:convert <course folder> <level> <out.json> [drills.json] [course slug]',
  );
}
const base = process.env.INIT_CWD ?? process.cwd();
const folder = path.resolve(base, folderArg);
const assets = path.join(folder, '..', 'assets');
const level = LevelSchema.parse(levelArg);
const readIfPresent = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

/** Module slug to the slugs of its Drills, from a content import file. */
function readDrillsByModule(file: string | undefined): Map<string, string[]> {
  if (file === undefined) return new Map();
  const content = ContentImportSchema.parse(
    JSON.parse(readFileSync(path.resolve(base, file), 'utf8')),
  );
  const modules = content.courses.flatMap((course) => course.modules);
  return new Map(modules.map((module) => [module.slug, module.drills.map((drill) => drill.slug)]));
}

const pages = readdirSync(folder)
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({ file, html: readFileSync(path.join(folder, file), 'utf8') }));
const { content, notes } = convertCourse(
  {
    pages,
    stylesheet: readIfPresent(path.join(assets, STYLESHEET)) ?? '',
    stateGraphScript: readIfPresent(path.join(assets, STATE_GRAPH_SCRIPT)),
  },
  {
    slug: slugArg ?? level,
    level,
    order: LEVELS.indexOf(level) + 1,
    drillsByModule: readDrillsByModule(drillsArg),
  },
);

writeFileSync(path.resolve(base, outArg), `${JSON.stringify(content, null, 2)}\n`);
const [course] = content.courses;
const lessons = course?.modules.flatMap((module) => module.lessons) ?? [];
const report = [
  `Wrote ${outArg}: ${course?.modules.length} modules, ${lessons.length} lessons.`,
  notes.length === 0 ? 'Everything was carried over exactly.' : 'Changed from the pages:',
  ...notes.map((note) => `- ${note}`),
];
process.stdout.write(`${report.join('\n')}\n`);
