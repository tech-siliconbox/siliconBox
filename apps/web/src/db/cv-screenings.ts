import 'server-only';
import {
  CV_FILES_KEPT,
  CV_FILE_KINDS,
  type CvFileKind,
  type CvReport,
  CvReportSchema,
  type CvScreening,
  CvScreeningSchema,
  type StoredCvFeedback,
  StoredCvFeedbackSchema,
} from '@siliconbox/shared';
import { Binary } from 'mongodb';
import { z } from 'zod';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

const HISTORY_LIMIT = 10;
/** A screening without its file's bytes, which leave only as a download. */
const WITHOUT_BYTES = { _id: 0, userId: 0, 'file.bytes': 0 } as const;

const screenings = () => getDb().collection(COLLECTIONS.cvScreenings);

export type CvUpload = {
  fileName: string;
  kind: CvFileKind;
  bytes: Uint8Array;
};

/** Stores the report with its file under the learner; only the newest files are kept. */
export async function saveScreening(
  userId: string,
  upload: CvUpload,
  report: CvReport,
): Promise<CvScreening> {
  const screening: CvScreening = {
    publicId: crypto.randomUUID(),
    fileName: upload.fileName,
    createdAt: new Date(),
    report: CvReportSchema.parse(report),
    file: { kind: upload.kind, size: upload.bytes.byteLength },
  };
  const file = { ...screening.file, bytes: new Binary(upload.bytes) };
  await screenings().insertOne({ userId, ...screening, file });
  await forgetOlderFiles(userId);
  return screening;
}

/** Keeps the learner's newest CV_FILES_KEPT files; older screenings keep their reports. */
async function forgetOlderFiles(userId: string): Promise<void> {
  const older = await screenings()
    .find(
      { userId, file: { $exists: true } },
      { sort: { createdAt: -1 }, skip: CV_FILES_KEPT, projection: { _id: 1 } },
    )
    .toArray();
  if (older.length === 0) return;
  await screenings().updateMany(
    { _id: { $in: older.map(({ _id }) => _id) } },
    { $unset: { file: '' } },
  );
}

/** The learner's screenings, newest first; a limit of 0 means all of them. */
async function screeningsOf(userId: string, limit: number): Promise<CvScreening[]> {
  const documents = await screenings()
    .find({ userId }, { sort: { createdAt: -1 }, limit, projection: WITHOUT_BYTES })
    .toArray();
  return documents.map((document) => CvScreeningSchema.parse(document));
}

/** The recent screenings the CV screening page lists. */
export const listScreenings = (userId: string) => screeningsOf(userId, HISTORY_LIMIT);

/** Every screening of the learner, for their data download. */
export const findAllScreenings = (userId: string) => screeningsOf(userId, 0);

const StoredFileSchema = z.object({
  fileName: z.string(),
  report: CvReportSchema,
  file: z.object({ kind: z.enum(CV_FILE_KINDS), bytes: z.instanceof(Binary) }).optional(),
});

/** One screening's report and file, if it is the learner's; `file` is null once no longer kept. */
export async function findScreeningFile(
  userId: string,
  publicId: string,
): Promise<{ report: CvReport; file: CvUpload | null } | null> {
  const found = await screenings().findOne(
    { userId, publicId },
    { projection: { _id: 0, fileName: 1, report: 1, file: 1 } },
  );
  if (found === null) return null;
  const { fileName, report, file } = StoredFileSchema.parse(found);
  if (file === undefined) return { report, file: null };
  return { report, file: { fileName, kind: file.kind, bytes: new Uint8Array(file.bytes.buffer) } };
}

/** Keeps AI feedback with its screening, in place of any earlier feedback. */
export async function saveFeedback(
  userId: string,
  publicId: string,
  feedback: StoredCvFeedback,
): Promise<void> {
  await screenings().updateOne(
    { userId, publicId },
    { $set: { feedback: StoredCvFeedbackSchema.parse(feedback) } },
  );
}

/** Deletes one screening with its file, or every one when `publicId` is omitted. */
export async function deleteScreenings(userId: string, publicId?: string): Promise<number> {
  const filter = publicId === undefined ? { userId } : { userId, publicId };
  const { deletedCount } = await screenings().deleteMany(filter);
  return deletedCount;
}
