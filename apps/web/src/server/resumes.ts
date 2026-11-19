import 'server-only';
import type { ResumeDocumentInput, SavedResume } from '@siliconbox/shared';
import { createResume, findResume, hasRoomForResume } from '@/db/resumes';
import { AppError } from './errors';

/** One of the learner's resumes; another learner's id is not found. */
export async function ownResume(userId: string, publicId: string): Promise<SavedResume> {
  const found = await findResume(userId, publicId);
  if (found === null) throw new AppError('NOT_FOUND', `resume ${publicId}`);
  return found;
}

/** Adds a resume, or refuses once the learner keeps the most allowed. */
export async function addResume(userId: string, input: ResumeDocumentInput): Promise<SavedResume> {
  const saved = await createResume(userId, input);
  if (saved === null) throw new AppError('RESUME_LIMIT_REACHED', `resumes of ${userId}`);
  return saved;
}

/** Refuses before any work when the learner already keeps the most resumes allowed. */
export async function assertRoomForResume(userId: string): Promise<void> {
  if (!(await hasRoomForResume(userId))) {
    throw new AppError('RESUME_LIMIT_REACHED', `resumes of ${userId}`);
  }
}
