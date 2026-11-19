import { z } from 'zod';
import { ASSESSMENT_HTML_MAX } from './assessment';
import { PublicIdSchema, SlugSchema } from './lesson';

// A course's capstone project (ADR 0029): uploaded as one .zip, scored by our experts against a
// rubric, with written feedback.

/** Where a capstone starts in its module's page, for links to it. */
export const capstoneAnchor = (slug: string) => `capstone-${slug}`;

export const CAPSTONE_MAX_BYTES = 10 * 1024 * 1024;
export const FEEDBACK_MAX_LENGTH = 5000;

export const RubricItemSchema = z.object({
  criterion: z.string().trim().min(1).max(200),
  points: z.number().int().min(1).max(100),
  fullMarks: z.string().trim().max(ASSESSMENT_HTML_MAX).nullish(),
});
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const PublishedCapstoneSchema = z.object({
  publicId: PublicIdSchema,
  slug: SlugSchema,
  title: z.string().min(1),
  passMark: z.number().int().min(1),
  rubric: z.array(RubricItemSchema).min(1),
});
export type PublishedCapstone = z.infer<typeof PublishedCapstoneSchema>;

export const rubricTotal = (rubric: readonly RubricItem[]): number =>
  rubric.reduce((sum, item) => sum + item.points, 0);

/** An expert's grade: points for each rubric criterion, in order, and feedback for the learner. */
export const CapstoneGradeSchema = z.strictObject({
  submission: PublicIdSchema,
  scores: z.array(z.number().int().min(0)).min(1).max(50),
  feedback: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
});
export type CapstoneGrade = z.infer<typeof CapstoneGradeSchema>;

/** Why a grade does not fit its rubric: one score per criterion, none above its points. */
export function gradeProblems(scores: readonly number[], rubric: readonly RubricItem[]): string[] {
  if (scores.length !== rubric.length) return ['Give a score for every criterion.'];
  return rubric.flatMap((item, index) =>
    (scores[index] ?? 0) > item.points ? [`${item.criterion}: at most ${item.points} points.`] : [],
  );
}
