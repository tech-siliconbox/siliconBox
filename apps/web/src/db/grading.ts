import 'server-only';
import type { Db, MongoClient } from 'mongodb';
import { z } from 'zod';
import { getConfig } from '@/server/config';
import { createMongoClient } from './client';
import { COLLECTIONS } from './collections';

// Drills' private parts live where the site's own database user cannot read them (ADR 0019).
// This connection uses a user that may only read them, and only run grading uses it (ADR 0021).

const globalForGrader = globalThis as typeof globalThis & { siliconboxGrader?: MongoClient };

function getGraderDb(): Db {
  globalForGrader.siliconboxGrader ??= createMongoClient(
    getConfig().MONGODB_URI_GRADER,
    'siliconbox-grader',
  );
  return globalForGrader.siliconboxGrader.db();
}

const HiddenDesignsSchema = z.object({
  referenceDesign: z.string().nullish(),
  bugVariants: z.array(z.object({ code: z.string() })),
});
export type HiddenDesigns = z.infer<typeof HiddenDesignsSchema>;

/** The designs a run is graded against, or null when the Drill has no private part. */
export async function findHiddenDesigns(drillCmsId: unknown): Promise<HiddenDesigns | null> {
  const found = await getGraderDb()
    .collection(COLLECTIONS.drillPrivate)
    .findOne(
      { drill: drillCmsId },
      { projection: { _id: 0, referenceDesign: 1, 'bugVariants.code': 1 } },
    );
  return found === null ? null : HiddenDesignsSchema.parse(found);
}
