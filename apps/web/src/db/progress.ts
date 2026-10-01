import 'server-only';
import { getDb } from './client';
import { COLLECTIONS } from './collections';

/** Records or clears one learner's completion of one lesson (unique per user and lesson). */
export async function setLessonDone(
  userId: string,
  lessonId: string,
  done: boolean,
): Promise<void> {
  const progress = getDb().collection(COLLECTIONS.progress);
  if (!done) {
    await progress.deleteOne({ userId, lessonId });
    return;
  }
  await progress.updateOne(
    { userId, lessonId },
    { $setOnInsert: { userId, lessonId, completedAt: new Date() } },
    { upsert: true },
  );
}

/** Which of these lessons the learner has completed. */
export async function findDoneLessonIds(userId: string, lessonIds: string[]): Promise<Set<string>> {
  const documents = await getDb()
    .collection(COLLECTIONS.progress)
    .find({ userId, lessonId: { $in: lessonIds } }, { projection: { _id: 0, lessonId: 1 } })
    .toArray();
  return new Set(documents.map((document) => String(document.lessonId)));
}
