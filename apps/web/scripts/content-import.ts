// `pnpm content:import <file.json> [check]`: loads courses, modules and lessons through Payload,
// so every document gets its public id, version history and validation exactly as if an editor
// had typed it in. Documents are matched by slug: importing again updates them in place.
// `check` validates the file and prints the plan without writing anything.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { type ContentImport, ContentImportSchema } from '@siliconbox/shared';
import { type Payload, getPayload } from 'payload';
import config from '../src/payload.config';

type Collection = 'courses' | 'modules' | 'lessons';
type Status = 'draft' | 'published';
type Tally = Record<'created' | 'updated', number>;

function readContent(file: string): ContentImport {
  // pnpm runs this from apps/web; resolve the path from where the command was typed.
  const fullPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
  return ContentImportSchema.parse(JSON.parse(readFileSync(fullPath, 'utf8')));
}

function describe(content: ContentImport): string {
  const modules = content.courses.flatMap((course) => course.modules);
  const lessons = modules.flatMap((module) => module.lessons);
  return `${content.courses.length} courses, ${modules.length} modules, ${lessons.length} lessons`;
}

/** Creates or updates the document with this slug and returns its id. */
async function upsert(
  payload: Payload,
  tally: Tally,
  target: { collection: Collection; slug: string; status?: Status },
  data: Record<string, unknown>,
): Promise<string> {
  const { collection, slug, status } = target;
  const draft = status === 'draft';
  const withStatus = status === undefined ? data : { ...data, _status: status };
  const { docs } = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const existing = docs[0];
  if (existing === undefined) {
    tally.created += 1;
    const created = await payload.create({
      collection,
      data: { ...withStatus, slug } as never,
      draft,
      overrideAccess: true,
    });
    return created.id;
  }
  tally.updated += 1;
  await payload.update({
    collection,
    id: existing.id,
    data: withStatus,
    draft,
    overrideAccess: true,
  });
  return existing.id;
}

async function importContent(payload: Payload, content: ContentImport): Promise<Tally> {
  const tally: Tally = { created: 0, updated: 0 };
  for (const { modules, slug, status, ...course } of content.courses) {
    const courseId = await upsert(payload, tally, { collection: 'courses', slug, status }, course);
    for (const { lessons, slug: moduleSlug, ...module } of modules) {
      const moduleId = await upsert(
        payload,
        tally,
        { collection: 'modules', slug: moduleSlug },
        { ...module, course: courseId },
      );
      for (const { slug: lessonSlug, status: lessonStatus, ...lesson } of lessons) {
        await upsert(
          payload,
          tally,
          { collection: 'lessons', slug: lessonSlug, status: lessonStatus },
          { ...lesson, module: moduleId },
        );
      }
    }
  }
  return tally;
}

const [file, mode] = process.argv.slice(2);
if (file === undefined) throw new Error('Usage: pnpm content:import <file.json> [check]');
const content = readContent(file);
process.stdout.write(`Valid: ${describe(content)}.\n`);
if (mode !== 'check') {
  const tally = await importContent(await getPayload({ config }), content);
  process.stdout.write(`Imported: ${tally.created} created, ${tally.updated} updated.\n`);
}
process.exit(0);
