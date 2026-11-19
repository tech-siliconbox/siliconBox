'use server';

import { CapstoneGradeSchema, ROUTES, gradeProblems, rubricTotal } from '@siliconbox/shared';
import { redirect } from 'next/navigation';
import { appendAudit } from '@/db/audit-log';
import { findSubmissionForReview, saveGrade } from '@/db/capstone-submissions';
import { findPublishedCapstone } from '@/db/content';
import { expertSession } from './capstone-reviews';

export type GradeState = { status: 'idle' } | { status: 'error'; message: string };

const fail = (message: string): GradeState => ({ status: 'error', message });

/**
 * Records an expert's grade: a score per rubric criterion and feedback for the learner. Editors
 * and the Owner only; every grade goes to the audit log. Grading again corrects the grade.
 */
export async function gradeCapstoneAction(
  _previous: GradeState,
  form: FormData,
): Promise<GradeState> {
  const session = await expertSession();
  if (session === null) return fail('Only Editors and the Owner can grade capstones.');
  const input = CapstoneGradeSchema.safeParse({
    submission: form.get('submission'),
    scores: form.getAll('score').map(Number),
    feedback: form.get('feedback'),
  });
  if (!input.success) return fail('Give a whole-number score for every criterion and feedback.');
  const submission = await findSubmissionForReview(input.data.submission);
  const capstone = submission && (await findPublishedCapstone({ publicId: submission.capstoneId }));
  if (!submission || !capstone) return fail('That submission or its capstone no longer exists.');
  const { rubric, passMark } = capstone.work;
  const problems = gradeProblems(input.data.scores, rubric);
  if (problems.length > 0) return fail(problems.join(' '));
  const total = input.data.scores.reduce((sum, score) => sum + score, 0);
  const gradedAt = new Date();
  await saveGrade(submission.publicId, {
    scores: input.data.scores,
    feedback: input.data.feedback,
    total,
    passed: total >= passMark,
    gradedBy: session.admin.email,
    gradedAt,
  });
  await appendAudit({
    action: 'capstone_graded',
    actorId: session.admin.id,
    subjectId: submission.userId,
    metadata: { submission: submission.publicId, total, outOf: rubricTotal(rubric) },
    createdAt: gradedAt,
  });
  redirect(ROUTES.capstoneReviews);
}
