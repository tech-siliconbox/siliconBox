import 'server-only';
import {
  type CvReport,
  CvReportSchema,
  type CvScreening,
  CvScreeningSchema,
} from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

const HISTORY_LIMIT = 10;

/** Stores the report only; the uploaded file is never kept. */
export async function saveScreening(
  userId: string,
  fileName: string,
  report: CvReport,
): Promise<CvScreening> {
  const screening = {
    publicId: crypto.randomUUID(),
    fileName,
    createdAt: new Date(),
    report: CvReportSchema.parse(report),
  };
  await getDb()
    .collection(COLLECTIONS.cvScreenings)
    .insertOne({ userId, ...screening });
  return screening;
}

export async function listScreenings(userId: string): Promise<CvScreening[]> {
  const documents = await getDb()
    .collection(COLLECTIONS.cvScreenings)
    .find(
      { userId },
      { sort: { createdAt: -1 }, limit: HISTORY_LIMIT, projection: { _id: 0, userId: 0 } },
    )
    .toArray();
  return documents.map((document) => CvScreeningSchema.parse(document));
}

/** Deletes one screening, or every screening of the learner when `publicId` is omitted. */
export async function deleteScreenings(userId: string, publicId?: string): Promise<number> {
  const filter = publicId === undefined ? { userId } : { userId, publicId };
  const { deletedCount } = await getDb().collection(COLLECTIONS.cvScreenings).deleteMany(filter);
  return deletedCount;
}
