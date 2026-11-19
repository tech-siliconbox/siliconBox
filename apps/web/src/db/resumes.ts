import 'server-only';
import { type Resume, ResumeSchema, emptyResume } from '@siliconbox/shared';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

export async function findResume(userId: string): Promise<Resume | null> {
  const document = await getDb()
    .collection(COLLECTIONS.resumes)
    .findOne({ userId }, { projection: { _id: 0, resume: 1 } });
  return document === null ? null : ResumeSchema.parse(document.resume);
}

/** The learner's saved resume, or a blank one from their account until they save. */
export async function findResumeOrBlank(learner: {
  userId: string;
  name: string;
  email: string;
}): Promise<Resume> {
  return (await findResume(learner.userId)) ?? emptyResume(learner.name, learner.email);
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
