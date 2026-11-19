// `pnpm content:import <file.json> [check] [prune]`: loads courses, modules, lessons, Drills,
// assessments (with their keys) and capstones
// through Payload, so every document gets its public id, version history and validation exactly
// as if an editor had typed it in. Documents are matched by slug: importing again updates them in
// place. `check` validates the file and writes nothing. Lessons or Drills left in an imported
// module that the file no longer lists are reported; `prune` deletes them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  type ContentImport,
  ContentImportSchema,
  type ImportAssessment,
  type ImportCapstone,
  type ImportDrill,
} from '@siliconbox/shared';
import { type Payload, getPayload } from 'payload';
import { SCRIPT_CONTEXT } from '../src/cms/hooks/clear-lesson-cache';
import config from '../src/payload.config';

type Collection = 'courses' | 'modules' | 'lessons' | 'drills' | 'assessments' | 'capstones';
type Status = 'draft' | 'published';
type Run = {
  payload: Payload;
  prune: boolean;
  tally: Record<'created' | 'updated', number>;
  stale: string[];
};

const WRITE = { overrideAccess: true, context: SCRIPT_CONTEXT } as const;

function readContent(file: string): ContentImport {
  // pnpm runs this from apps/web; resolve the path from where the command was typed.
  const fullPath = path.resolve(process.env.INIT_CWD ?? process.cwd(), file);
  return ContentImportSchema.parse(JSON.parse(readFileSync(fullPath, 'utf8')));
}

function describe(content: ContentImport): string {
  const modules = content.courses.flatMap((course) => course.modules);
  const lessons = modules.flatMap((module) => module.lessons).length;
  const drills = modules.flatMap((module) => module.drills).length;
  const graded = modules.filter((module) => module.assessment ?? module.capstone).length;
  return `${content.courses.length} courses, ${modules.length} modules, ${lessons} lessons, ${drills} Drills, ${graded} modules with graded work`;
}

/** Optional fields a file may leave out. Leaving one out clears it: the file is the source of truth. */
const OPTIONAL_FIELDS: Record<Collection, string[]> = {
  courses: ['summary', 'introduction'],
  modules: ['summary'],
  lessons: ['durationMinutes'],
  drills: ['topic', 'designCode'],
  assessments: [],
  capstones: [],
};

/** Creates or updates the document with this slug and returns its id. */
async function upsert(
  run: Run,
  target: { collection: Collection; slug: string; status?: Status },
  data: Record<string, unknown>,
): Promise<string> {
  const { collection, slug, status } = target;
  const draft = status === 'draft';
  const withStatus = status === undefined ? data : { ...data, _status: status };
  const { docs } = await run.payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const existing = docs[0];
  if (existing === undefined) {
    run.tally.created += 1;
    const created = await run.payload.create({
      collection,
      data: { ...withStatus, slug } as never,
      draft,
      ...WRITE,
    });
    return created.id;
  }
  run.tally.updated += 1;
  const cleared = OPTIONAL_FIELDS[collection].filter((field) => !(field in data));
  const update = { ...Object.fromEntries(cleared.map((field) => [field, null])), ...withStatus };
  await run.payload.update({ collection, id: existing.id, data: update, draft, ...WRITE });
  return existing.id;
}

type PrivatePart =
  | { collection: 'drill_private'; owner: 'drill' }
  | { collection: 'assessment_keys'; owner: 'assessment' };

/** A private half sits in its own collection, one document per owner (a Drill, an assessment). */
async function upsertPrivate(
  run: Run,
  { collection, owner }: PrivatePart,
  ownerId: string,
  data: Record<string, unknown>,
) {
  const { docs } = await run.payload.find({
    collection,
    where: { [owner]: { equals: ownerId } },
    limit: 1,
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  const existing = docs[0];
  const document = { ...data, [owner]: ownerId } as never;
  if (existing === undefined) {
    await run.payload.create({ collection, data: document, ...WRITE });
  } else {
    await run.payload.update({ collection, id: existing.id, data: document, ...WRITE });
  }
}

async function importDrill(run: Run, moduleId: string, drill: ImportDrill) {
  const { slug, status, private: hidden, ...visible } = drill;
  const drillId = await upsert(
    run,
    { collection: 'drills', slug, status },
    { ...visible, module: moduleId },
  );
  // The CMS stores an absent optional field as null.
  await upsertPrivate(run, { collection: 'drill_private', owner: 'drill' }, drillId, {
    referenceSolution: hidden.referenceSolution,
    referenceDesign: hidden.referenceDesign ?? null,
    hiddenProperties: hidden.hiddenProperties ?? null,
    bugVariants: hidden.bugVariants.map((variant) => ({ ...variant, note: variant.note ?? null })),
  });
}

/** An assessment, and its answer key in the collection the site cannot read (ADR 0029). */
async function importAssessment(run: Run, moduleId: string, assessment: ImportAssessment) {
  const { slug, status, key, ...visible } = assessment;
  const assessmentId = await upsert(
    run,
    { collection: 'assessments', slug, status },
    { ...visible, module: moduleId },
  );
  await upsertPrivate(run, { collection: 'assessment_keys', owner: 'assessment' }, assessmentId, {
    answers: key.map((line) => ({ correct: line.correct, why: line.why ?? null })),
  });
}

async function importCapstone(run: Run, moduleId: string, capstone: ImportCapstone) {
  const { slug, status, ...fields } = capstone;
  await upsert(run, { collection: 'capstones', slug, status }, { ...fields, module: moduleId });
}

/** Lessons or Drills in the module that the file no longer lists: reported, or deleted on prune. */
async function sweep(run: Run, collection: 'lessons' | 'drills', moduleId: string, keep: string[]) {
  const { docs } = await run.payload.find({
    collection,
    where: { and: [{ module: { equals: moduleId } }, { slug: { not_in: keep } }] },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });
  for (const doc of docs) {
    run.stale.push(`${collection} ${doc.slug} "${doc.title}"`);
    if (!run.prune) continue;
    if (collection === 'drills') {
      await run.payload.delete({
        collection: 'drill_private',
        where: { drill: { equals: doc.id } },
        ...WRITE,
      });
    }
    await run.payload.delete({ collection, id: doc.id, ...WRITE });
  }
}

type ImportModule = ContentImport['courses'][number]['modules'][number];

async function importModule(run: Run, courseId: string, module: ImportModule) {
  const { lessons, drills, assessment, capstone, slug, ...fields } = module;
  const moduleId = await upsert(
    run,
    { collection: 'modules', slug },
    { ...fields, course: courseId },
  );
  for (const { slug: lessonSlug, status, ...lesson } of lessons) {
    await upsert(
      run,
      { collection: 'lessons', slug: lessonSlug, status },
      { ...lesson, module: moduleId },
    );
  }
  for (const drill of drills) await importDrill(run, moduleId, drill);
  if (assessment) await importAssessment(run, moduleId, assessment);
  if (capstone) await importCapstone(run, moduleId, capstone);
  // Only the kinds this file lists are swept, so a Drills-only file never touches lessons.
  if (lessons.length > 0)
    await sweep(
      run,
      'lessons',
      moduleId,
      lessons.map((l) => l.slug),
    );
  if (drills.length > 0)
    await sweep(
      run,
      'drills',
      moduleId,
      drills.map((d) => d.slug),
    );
}

async function importContent(run: Run, content: ContentImport): Promise<void> {
  for (const { modules, slug, status, ...course } of content.courses) {
    const courseId = await upsert(run, { collection: 'courses', slug, status }, course);
    for (const module of modules) await importModule(run, courseId, module);
  }
}

function report(run: Run): string {
  const lines = [`Imported: ${run.tally.created} created, ${run.tally.updated} updated.`];
  if (run.stale.length > 0) {
    lines.push(
      run.prune
        ? 'Removed (no longer in the file):'
        : 'Not in the file (run again with `prune` to remove):',
    );
    lines.push(...run.stale.map((item) => `- ${item}`));
  }
  return `${lines.join('\n')}\n`;
}

const [file, ...flags] = process.argv.slice(2);
if (file === undefined) throw new Error('Usage: pnpm content:import <file.json> [check] [prune]');
const content = readContent(file);
process.stdout.write(`Valid: ${describe(content)}.\n`);
if (!flags.includes('check')) {
  const run: Run = {
    payload: await getPayload({ config }),
    prune: flags.includes('prune'),
    tally: { created: 0, updated: 0 },
    stale: [],
  };
  await importContent(run, content);
  process.stdout.write(report(run));
}
process.exit(0);
