// `pnpm content:convert <course folder> <level> <out.json> [course slug]`: turns a folder of
// course HTML pages into the JSON file `pnpm content:import` loads. The text is copied as
// written; every place where something could not be kept exactly is printed at the end.
// The course folder holds the pages, with the stylesheet and scripts in ../assets.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { LEVELS, LevelSchema } from '@siliconbox/shared';
import { convertCourse } from './course-html/course';
import { readSvgRules } from './course-html/svg-styles';

const DIAGRAM_SCOPE = 'fv-flow';
const STATE_GRAPH_SCRIPT = 'sim-vs-formal.js';

const [folderArg, levelArg, outArg, slugArg] = process.argv.slice(2);
if (!folderArg || !levelArg || !outArg) {
  throw new Error('Usage: pnpm content:convert <course folder> <level> <out.json> [course slug]');
}
const base = process.env.INIT_CWD ?? process.cwd();
const folder = path.resolve(base, folderArg);
const assets = path.join(folder, '..', 'assets');
const level = LevelSchema.parse(levelArg);
const readIfPresent = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8') : null);

const pages = readdirSync(folder)
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({ file, html: readFileSync(path.join(folder, file), 'utf8') }));
const { content, notes } = convertCourse(
  {
    pages,
    svgRules: readSvgRules(readIfPresent(path.join(assets, 'style.css')) ?? '', DIAGRAM_SCOPE),
    stateGraphScript: readIfPresent(path.join(assets, STATE_GRAPH_SCRIPT)),
  },
  { slug: slugArg ?? level, level, order: LEVELS.indexOf(level) + 1 },
);

writeFileSync(path.resolve(base, outArg), `${JSON.stringify(content, null, 2)}\n`);
const [course] = content.courses;
const lessons = course?.modules.flatMap((module) => module.lessons) ?? [];
const report = [
  `Wrote ${outArg}: ${course?.modules.length} modules, ${lessons.length} lessons.`,
  notes.length === 0 ? 'Everything was carried over exactly.' : 'Not carried over exactly:',
  ...notes.map((note) => `- ${note}`),
];
process.stdout.write(`${report.join('\n')}\n`);
