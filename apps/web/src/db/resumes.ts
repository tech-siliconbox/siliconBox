import 'server-only';
import {
  RESUMES_MAX,
  type Resume,
  type ResumeDocumentInput,
  ResumeSchema,
  type ResumeSummary,
  ResumeSummarySchema,
  type SavedResume,
  SavedResumeSchema,
} from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

// A learner's resumes: up to RESUMES_MAX, each with a name and its content.

const resumes = () => getDb().collection(COLLECTIONS.resumes);
const NEWEST_FIRST = { updatedAt: -1 } as const;
const SUMMARY = { _id: 0, publicId: 1, title: 1, updatedAt: 1 } as const;
const WITH_CONTENT = { ...SUMMARY, resume: 1 } as const;

/** The learner's resumes, most recently edited first, without their content. */
export async function listResumes(userId: string): Promise<ResumeSummary[]> {
  const found = await resumes()
    .find({ userId }, { projection: SUMMARY, sort: NEWEST_FIRST })
    .toArray();
  return found.map((document) => ResumeSummarySchema.parse(document));
}

/** One of the learner's resumes; another learner's id is not found. */
export async function findResume(userId: string, publicId: string): Promise<SavedResume | null> {
  const found = await resumes().findOne({ userId, publicId }, { projection: WITH_CONTENT });
  return found === null ? null : SavedResumeSchema.parse(found);
}

/** The most recently edited resume, for the builder to open first. */
export async function findLatestResume(userId: string): Promise<SavedResume | null> {
  const found = await resumes().findOne(
    { userId },
    { projection: WITH_CONTENT, sort: NEWEST_FIRST },
  );
  return found === null ? null : SavedResumeSchema.parse(found);
}

/** Every resume with its content, for the learner's data download. */
export async function findAllResumes(userId: string): Promise<SavedResume[]> {
  const found = await resumes()
    .find({ userId }, { projection: WITH_CONTENT, sort: NEWEST_FIRST })
    .toArray();
  return found.map((document) => SavedResumeSchema.parse(document));
}

/** Whether the learner may add another resume. */
export async function hasRoomForResume(userId: string): Promise<boolean> {
  return (await resumes().countDocuments({ userId })) < RESUMES_MAX;
}

/** Adds a resume, or returns null when the learner already keeps the most allowed. */
export async function createResume(
  userId: string,
  input: ResumeDocumentInput,
): Promise<SavedResume | null> {
  if (!(await hasRoomForResume(userId))) return null;
  const now = new Date();
  const saved: SavedResume = {
    publicId: crypto.randomUUID(),
    title: input.title,
    updatedAt: now,
    resume: ResumeSchema.parse(input.resume),
  };
  await resumes().insertOne({ userId, ...saved, createdAt: now });
  return saved;
}

/** Saves a resume's name and content; null when it is not the learner's. */
export async function saveResume(
  userId: string,
  publicId: string,
  input: ResumeDocumentInput,
): Promise<ResumeSummary | null> {
  const resume: Resume = ResumeSchema.parse(input.resume);
  const updatedAt = new Date();
  const { matchedCount } = await resumes().updateOne(
    { userId, publicId },
    { $set: { title: input.title, resume, updatedAt } },
  );
  return matchedCount === 1 ? { publicId, title: input.title, updatedAt } : null;
}

/** Deletes one of the learner's resumes; false when it is not theirs. */
export async function deleteResume(userId: string, publicId: string): Promise<boolean> {
  const { deletedCount } = await resumes().deleteOne({ userId, publicId });
  return deletedCount === 1;
}
