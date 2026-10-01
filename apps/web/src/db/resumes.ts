import 'server-only';
import { type Resume, ResumeSchema } from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

export async function findResume(userId: string): Promise<Resume | null> {
  const document = await getDb()
    .collection(COLLECTIONS.resumes)
    .findOne({ userId }, { projection: { _id: 0, resume: 1 } });
  return document === null ? null : ResumeSchema.parse(document.resume);
}

export async function saveResume(userId: string, resume: Resume): Promise<void> {
  await getDb()
    .collection(COLLECTIONS.resumes)
    .updateOne(
      { userId },
      {
        $set: { resume: ResumeSchema.parse(resume), updatedAt: new Date() },
        $setOnInsert: { userId },
      },
      { upsert: true },
    );
}

export async function deleteResume(userId: string): Promise<void> {
  await getDb().collection(COLLECTIONS.resumes).deleteOne({ userId });
}
