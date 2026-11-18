import { z } from 'zod';
import { PublicIdSchema, SlugSchema } from './lesson';

// A course's graded assessment (ADR 0029): multiple-choice questions shown in the module's page,
// scored on the server against a key learners never receive.

/** Where an assessment starts in its module's page, for links to it. */
export const assessmentAnchor = (slug: string) => `assessment-${slug}`;

/** At most this many attempts per learner and assessment, with no wait (founder, 2026-11-19). */
export const ASSESSMENT_ATTEMPTS = 3;
/** Options are lettered in the page as the author wrote them: 0 is A. */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type OptionLetter = (typeof OPTION_LETTERS)[number];
export const ASSESSMENT_HTML_MAX = 4000;

const markup = z.string().trim().min(1).max(ASSESSMENT_HTML_MAX);
const optionIndex = z
  .number()
  .int()
  .min(0)
  .max(OPTION_LETTERS.length - 1);

/** One question as learners see it: the author's markup for it and for each option. */
export const AssessmentQuestionSchema = z.object({
  topic: z.string().trim().max(200).nullish(),
  html: markup,
  options: z
    .array(z.object({ html: markup }))
    .min(2)
    .max(OPTION_LETTERS.length),
});
export type AssessmentQuestion = z.infer<typeof AssessmentQuestionSchema>;

export const PublishedAssessmentSchema = z.object({
  publicId: PublicIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
  passMark: z.number().int().min(1),
  questions: z.array(AssessmentQuestionSchema).min(1),
});
export type PublishedAssessment = z.infer<typeof PublishedAssessmentSchema>;

/** One line of the hidden key: the right option's letter, as the author writes it, and why. */
export const KeyAnswerSchema = z.object({ correct: z.enum(OPTION_LETTERS), why: markup.nullish() });
export type KeyAnswer = z.infer<typeof KeyAnswerSchema>;

/** A submitted attempt: the option chosen for every question, in order. */
export const AttemptInputSchema = z.strictObject({
  answers: z.array(optionIndex).min(1).max(200),
});

/** How many answers match the key, question by question. */
export const scoreAttempt = (answers: readonly number[], key: readonly KeyAnswer[]): number =>
  key.filter((line, index) => OPTION_LETTERS[answers[index] ?? -1] === line.correct).length;

/**
 * Where a learner stands: their best score, whether it passes, the attempts left, and whether
 * the assessment is finished for them (passed, or every attempt used).
 */
export function assessmentStanding(attempts: readonly { score: number }[], passMark: number) {
  const best = attempts.length === 0 ? null : Math.max(...attempts.map((a) => a.score));
  const passed = best !== null && best >= passMark;
  const attemptsLeft = passed ? 0 : Math.max(0, ASSESSMENT_ATTEMPTS - attempts.length);
  return { best, passed, attemptsLeft, finished: attemptsLeft === 0 };
}
