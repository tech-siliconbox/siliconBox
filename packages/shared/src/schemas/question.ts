import { z } from 'zod';
import { PublicIdSchema, SlugSchema } from './lesson';

export const QUESTIONS_PER_PAGE = 20;

/** Search and filters for the public question bank (query string). */
export const QuestionQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  topic: z.string().trim().min(1).max(50).optional(),
  company: SlugSchema.optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});
export type QuestionQuery = z.infer<typeof QuestionQuerySchema>;

/** The public part of a question: never the answer, never the internal source note. */
export const PublicQuestionSchema = z.object({
  publicId: PublicIdSchema,
  text: z.string().min(1),
  topics: z
    .array(z.string())
    .nullish()
    .transform((topics) => topics ?? []),
  companies: z.array(z.object({ name: z.string(), slug: z.string(), year: z.number().int() })),
});
export type PublicQuestion = z.infer<typeof PublicQuestionSchema>;

export const QuestionPageSchema = z.object({
  questions: z.array(PublicQuestionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageCount: z.number().int(),
});
export type QuestionPage = z.infer<typeof QuestionPageSchema>;
