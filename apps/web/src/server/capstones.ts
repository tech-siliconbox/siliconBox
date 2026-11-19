import 'server-only';
import { type PublishedCapstone, CAPSTONE_MAX_BYTES } from '@siliconbox/shared';
import { type Submission, findSubmissions, saveSubmission } from '@/db/capstone-submissions';
import { findPublishedCapstone } from '@/db/content';
import type { Identity } from './auth/authenticate';
import { markHtmlFragment } from './course-html';
import { courseWorkAccess } from './course-work';
import { assertEntitled, isEntitled } from './entitlements';
import { AppError } from './errors';
import { startsWith } from './file-bytes';
import { learnerMarkCode } from './paid-content';
import { readUpload } from './upload';

// A .zip starts "PK" then 03 04 (or 05 06 when it is empty).
const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
];
const FILE_NAME_MAX = 120;

export type CapstoneView = {
  capstone: PublishedCapstone;
  /** Newest first. */
  submissions: Submission[];
  passed: boolean;
};

const hasPassed = (submissions: readonly Submission[]) =>
  submissions.some((submission) => submission.grade?.passed === true);

/** The capstone shown in a module's page, for a learner who may open its level; null otherwise. */
export async function readCapstoneView(
  identity: Identity,
  slug: string,
  now: Date = new Date(),
): Promise<CapstoneView | null> {
  const found = await findPublishedCapstone({ slug });
  if (found === null || !(await isEntitled(courseWorkAccess(found.level), identity, now))) {
    return null;
  }
  const code = learnerMarkCode(identity.userId);
  const capstone = {
    ...found.work,
    rubric: found.work.rubric.map((item) => ({
      ...item,
      fullMarks: item.fullMarks == null ? null : markHtmlFragment(item.fullMarks, code),
    })),
  };
  const submissions = await findSubmissions(identity.userId, found.work.publicId);
  return { capstone, submissions, passed: hasPassed(submissions) };
}

/**
 * Keeps an uploaded project (.zip, checked by its bytes) as the learner's submission waiting for
 * review, replacing one already waiting. Refused once a submission has passed.
 */
export async function submitCapstone(
  identity: Identity,
  publicId: string,
  request: Request,
  now: Date = new Date(),
): Promise<void> {
  const found = await findPublishedCapstone({ publicId });
  if (found === null) throw new AppError('NOT_FOUND', `no published capstone ${publicId}`);
  await assertEntitled(courseWorkAccess(found.level), identity, now);
  if (hasPassed(await findSubmissions(identity.userId, publicId))) {
    throw new AppError('CAPSTONE_CLOSED', 'already passed');
  }
  const { file } = await readUpload(request, CAPSTONE_MAX_BYTES, 'CAPSTONE_NOT_SUPPORTED');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!ZIP_SIGNATURES.some((signature) => startsWith(bytes, signature))) {
    throw new AppError('CAPSTONE_NOT_SUPPORTED', 'not a zip file');
  }
  await saveSubmission(identity.userId, publicId, {
    fileName: file.name.slice(0, FILE_NAME_MAX),
    bytes,
  });
}
