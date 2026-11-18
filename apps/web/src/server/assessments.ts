import 'server-only';
import {
  type KeyAnswer,
  type PublishedAssessment,
  assessmentStanding,
  scoreAttempt,
} from '@siliconbox/shared';
import { type Attempt, findAttempts, recordAttempt } from '@/db/assessment-attempts';
import { findPublishedAssessment } from '@/db/content';
import { findAssessmentKey } from '@/db/grading';
import type { Identity } from './auth/authenticate';
import { markHtmlFragment } from './course-html';
import { courseWorkAccess } from './course-work';
import { assertEntitled, isEntitled } from './entitlements';
import { AppError } from './errors';
import { learnerMarkCode } from './paid-content';

export type AssessmentView = {
  /** The questions, each carrying the learner's invisible mark. */
  assessment: PublishedAssessment;
  attempts: Attempt[];
  standing: ReturnType<typeof assessmentStanding>;
  /** The answer key, once the learner has passed or used every attempt; null before. */
  review: KeyAnswer[] | null;
};

function withMark(assessment: PublishedAssessment, code: number): PublishedAssessment {
  return {
    ...assessment,
    questions: assessment.questions.map((question) => ({
      ...question,
      html: markHtmlFragment(question.html, code),
      options: question.options.map((option) => ({ html: markHtmlFragment(option.html, code) })),
    })),
  };
}

/**
 * The assessment shown in a module's page, for a learner who may open its level; null otherwise,
 * so the page leaves it out. The key comes only when the assessment is finished for them.
 */
export async function readAssessmentView(
  identity: Identity,
  slug: string,
  now: Date = new Date(),
): Promise<AssessmentView | null> {
  const found = await findPublishedAssessment({ slug });
  if (found === null || !(await isEntitled(courseWorkAccess(found.level), identity, now))) {
    return null;
  }
  const attempts = await findAttempts(identity.userId, found.work.publicId);
  const standing = assessmentStanding(attempts, found.work.passMark);
  return {
    assessment: withMark(found.work, learnerMarkCode(identity.userId)),
    attempts,
    standing,
    review: standing.finished ? await findAssessmentKey(found.cmsId) : null,
  };
}

/** Scores an attempt on the server and keeps it; only the score goes back (ADR 0029). */
export async function submitAttempt(
  identity: Identity,
  publicId: string,
  answers: readonly number[],
  now: Date = new Date(),
) {
  const found = await findPublishedAssessment({ publicId });
  if (found === null) throw new AppError('NOT_FOUND', `no published assessment ${publicId}`);
  await assertEntitled(courseWorkAccess(found.level), identity, now);
  const { questions, passMark } = found.work;
  const fits = answers.every((answer, i) => answer < (questions[i]?.options.length ?? 0));
  if (answers.length !== questions.length || !fits) {
    throw new AppError('VALIDATION_FAILED', 'answers do not match the questions');
  }
  const before = await findAttempts(identity.userId, publicId);
  if (assessmentStanding(before, passMark).finished) {
    throw new AppError('ASSESSMENT_CLOSED', 'passed or out of attempts');
  }
  const key = await findAssessmentKey(found.cmsId);
  if (key?.length !== questions.length) throw new Error(`assessment ${publicId} has no full key`);
  const score = scoreAttempt(answers, key);
  if (
    !(await recordAttempt(identity.userId, publicId, { answers: [...answers], score, at: now }))
  ) {
    throw new AppError('ASSESSMENT_CLOSED', 'attempt limit reached');
  }
  const after = assessmentStanding([...before, { score }], passMark);
  return { score, total: questions.length, passed: after.passed, attemptsLeft: after.attemptsLeft };
}
