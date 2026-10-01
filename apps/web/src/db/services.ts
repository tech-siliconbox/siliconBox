import 'server-only';
import { type PublicService, PublicServiceSchema } from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

export async function findServices(): Promise<PublicService[]> {
  const documents = await getDb()
    .collection(COLLECTIONS.services)
    .find(
      {},
      {
        sort: { order: 1 },
        projection: { _id: 0, slug: 1, title: 1, summary: 1, status: 1, lockedReason: 1 },
      },
    )
    .toArray();
  return documents.map((document) => PublicServiceSchema.parse(document));
}
